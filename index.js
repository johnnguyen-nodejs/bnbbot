import * as dotenv from 'dotenv';
dotenv.config(); 
import "./prototype.js";
import cron from 'node-cron'
import Binance from 'binance-api-node'
import { setTimeout } from 'node:timers/promises' 
import { RSI } from 'technicalindicators'
import { redis } from './lib.js'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
})
const greenOrRed = (data) => {
    return parseFloat(data.close) >= parseFloat(data.open) ? 'G': 'R';
}

const getSr = async (data, item) => {
    try {
        const sr = new Map()
        await data.map((i) => {
            sr.set((i | 0) - (i | 0) % 1000, (sr.get((i | 0) - (i | 0) % 1000) || 0) + 1)
        })
        console.log(sr.get((item | 0) - (item | 0) % 1000))
        return sr.get((item | 0) - (item | 0) % 1000) > 28 ? 1: 0
    } catch (error) {
        throw new Error(error)
    }
}

const getUSDTBalance = async () => {
    try {
        const accountInfo = await client.futuresAccountInfo();
        const usdtBalance = accountInfo.assets.find(asset => asset.asset === 'USDT').availableBalance;
        return parseFloat(usdtBalance);
    } catch (error) {
        console.error('Error fetching USDT balance:', error); 
    }
};

const getMarketPrice = async (symbol) => {
    try {
        const ticker = await client.futuresPrices({ symbol });
        return parseFloat(ticker[symbol]);
    } catch (error) {
        console.error('Error fetching market price:', error);
    }
};

const placeMarketOrder = async (symbol, side, quantity) => {
    try {
        const order = await client.futuresOrder({
            symbol: symbol,
            side: side,
            type: 'MARKET',
            quantity: quantity,
        });
        console.log('Market Order:', order);
        return order;
    } catch (error) {
        console.error('Error placing market order:', error);
    }
};

const placeStopLossOrder = async (symbol, side, stopPrice) => {
    try {
      const order = await client.futuresOrder({
        symbol: symbol,
        side: side,
        type: 'STOP_MARKET',
        closePosition: 'true',
        stopPrice: stopPrice,
      });
      console.log('Stop Loss Order:', order);
      return order;
    } catch (error) {
      console.error('Error placing stop loss order:', error);
    }
  };

const func = async () => {
    try {
        console.log(Date.now())
        await setTimeout(10000)
        // get candle stick data
        console.time('api')
        const candles = (await client.futuresCandles({
            symbol: 'BTCUSDT',
            interval: '8h',
            limit: 1001
        }))
        await candles.pop()
        console.timeEnd('api')
        const closePrices = candles.map(candle => parseFloat(candle.close))
        const src = await getSr(closePrices, closePrices.V(0))
        const rsi14 = RSI.calculate({
            values: closePrices,
            period: 14
        })
        // check condition
        const balance = await getUSDTBalance()
        if(balance > 5){
            console.log(
                rsi14.V(0) ,
                greenOrRed(candles.V(0)) ,
                greenOrRed(candles.V(1)) ,
                greenOrRed(candles.V(2)) ,
                greenOrRed(candles.V(3)) ,
                Number(((closePrices.V(0) / closePrices.V(3) - 1) * 100).toFixed(2)),
                src
            )
            if(
                rsi14.V(0) > 40 &&
                greenOrRed(candles.V(0)) === 'G' &&
                greenOrRed(candles.V(1)) === 'G' &&
                greenOrRed(candles.V(2)) === 'G' &&
                greenOrRed(candles.V(3)) === 'R' &&
                Number(((closePrices.V(0) / closePrices.V(3) - 1) * 100).toFixed(2)) > 0.5 &&
                Number(((closePrices.V(1) / closePrices.V(3) - 1) * 100).toFixed(2)) < 8
                // src == 1
            ) {
                console.log('buy now')
                
                console.log(balance)
                const price = await getMarketPrice('BTCUSDT')
                const order = await placeMarketOrder('BTCUSDT', 'BUY', (balance*10/price).fix(3))
                if(order) {
                    const getOrder = await client.futuresGetOrder({
                        symbol: 'BTCUSDT',
                        orderId: order.orderId,
                        clientOrderId: order.clientOrderId
                    })
                    try {
                        
                        await client.futuresCancelOrder({
                            symbol: 'BTCUSDT',
                            orderId: Number(await redis.get('stopId'))
                        })
                    } catch (error) {
                        console.log('No Order')
                    }
                    const stopOrder = await placeStopLossOrder('BTCUSDT', 'SELL', (parseFloat(getOrder.avgPrice)*0.9857).fix(1))
                    await redis.set('stopId', stopOrder.orderId)
                    await redis.set('stopPrice', (parseFloat(getOrder.avgPrice)*0.9857).fix(1))
                    console.log('stop', stopOrder)
                }
                await redis.set('tradeStatus', 1)
            }

        } else {
            console.log('update stoploss')
            const orderId = Number(await redis.get('stopId'))
            await client.futuresCancelOrder({
                symbol: 'BTCUSDT',
                orderId
            })
            const newPrice = (Number(await redis.get('stopPrice'))*1.0021).fix(1)
            const newStopOrder = await placeStopLossOrder('BTCUSDT', 'SELL', newPrice) 
            await redis.set('stopId', newStopOrder.orderId)
            await redis.set('stopPrice', newPrice)
        }
        // place order or update stop loss
        return
    } catch (error) {
        console.log(error)
    }
}

// await func()

cron.schedule('0 0,8,16 * * *', func, {
    scheduled: true,
    timezone: 'Etc/GMT'
  });
  
  console.log('Scheduler started');