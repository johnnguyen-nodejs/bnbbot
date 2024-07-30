import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import cron from 'node-cron'
import Binance from 'binance-api-node'
import { setTimeout } from 'node:timers/promises'
import { redis } from  './lib.js'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
})


const getUSDBalance = async () => {
    try {
        const accountInfo = await client.futuresAccountInfo();
        const usdtBalance = accountInfo.assets.find(asset => asset.asset === 'USDT').availableBalance;
        return parseFloat(usdtBalance);
    } catch (error) {
        throw new Error(error)
    }
};

const getMarketPrice = async (symbol) => {
    try {
        const ticker = await client.futuresPrices({ symbol });
        return parseFloat(ticker[symbol]);
    } catch (error) {
        throw new Error(error)
    }
};

const placeLimitOrder = async (symbol, side, quantity, price) => {
    try {
        const order = await client.futuresOrder({
            symbol,
            side,
            type: 'LIMIT',
            quantity,
            price,
            reduceOnly: side == 'SELL' ? true : false
        });
        return order;
    } catch (error) {
        console.log(error)
        throw new Error(error)
    }
};

const placeMarketOrder = async (symbol, side, quantity) => {
    try {
        const order = await client.futuresOrder({
            symbol: symbol,
            side: side,
            type: 'MARKET',
            quantity: quantity,
            reduceOnly: true
        });
        console.log('Market Order:', order);
        return order;
    } catch (error) {
        throw new Error(error)
    }
};

const placeTakeProfitOrder = async (symbol, side, price, stopPrice) => {
    try {
        const order = await client.futuresOrder({
            symbol,
            side,
            type: 'TAKE_PROFIT',
            price,
            stopPrice
        });
        console.log('Stop Loss Order:', order);
        return order;
    } catch (error) {
        throw new Error(error)
    }
};
const placeTakeProfitMarketOrder = async (symbol, side, stopPrice) => {
    try {
        const order = await client.futuresOrder({
            symbol,
            side,
            type: 'TAKE_PROFIT_MARKET',
            closePosition: 'true',
            stopPrice
        });
        console.log('Stop Loss Order:', order);
        return order;
    } catch (error) {
        throw new Error(error)
    }
};

const placeTrailingOrder = async (symbol, side, activationPrice, quantity) => {
    try {
        const order = await client.futuresOrder({
            symbol,
            side,
            type: 'TRAILING_STOP_MARKET',
            activationPrice,
            callbackRate: 0.1,
            quantity,
            reduceOnly: true
        })
        console.log('Trailing Order:', order);
        return order
    } catch (error) {
        throw new Error(error)
    }
}

const cancelOrder = async (symbol, orderId) => {
    try {
        const getOrder = await client.futuresOpenOrders({
            symbol
        })
        if((getOrder.filter(item => item.orderId == orderId)).length == 0) return 'No order'
        const order = await client.futuresCancelOrder({
            symbol,
            orderId
        })
        return order.orderId
    } catch (error) {
        throw new Error(error)
    }
}
let handle = new Map()

const func = async () => {
    try {
        await redis.set('amountBuy', 0)
        const balance = await getUSDBalance()
        await setTimeout(10000)
        const candles = (await client.futuresCandles({
            symbol: 'BTCUSDT',
            interval: '1h',
            limit: 2
        }))
        // console.log(candles)
        let price = Number(candles[1].open)
        await client.ws.futuresUser(async (msg) => {
            try {
                
                if(msg?.eventType == 'ORDER_TRADE_UPDATE' && msg?.side == "BUY" && msg?.orderType == 'LIMIT' && (msg?.orderStatus == 'FILLED' || msg?.orderStatus == 'PARTIALLY_FILLED')) {
                    if(!handle.has(msg.eventTime)) {
                        handle.set(msg.eventTime, true)
                        console.log(msg)
                        await redis.set('stt', 1)
                    }
                }
            } catch (error) {
                throw new Error(error)
            }
        })
        if(1 - Number(candles[0].close)/Number(candles[0].open) > 0.004) {
            let order = await placeLimitOrder('BTCUSDT', 'BUY', (balance*5/(price*0.995)).fix(3), (price*0.995).fix(1))
            await redis.set(`orderId`, order.orderId)
            await redis.set('amountBuy', (balance*5/(price*0.995)).fix(3))
            console.log(`create start order`, order.orderId)
        }
        return true
    } catch (error) {
        console.log(error)
    }
}

const func1 = async () => {
    try {
        // if(Number(await redis.get(`stt`)) != 1) {
            await cancelOrder('BTCUSDT', Number(await redis.get(`orderId`)))
            console.log(`cancel original order at middle`)
        // }
    } catch (error) {
        
    }
}
const func2 = async () => {
    try {
        const accountInfo = await client.futuresAccountInfo()
        console.log(accountInfo.positions.filter(pos => pos.symbol == 'BTCUSDT'))
        // if(Number(await redis.get(`stt`)) == 1) {
            // await redis.set('stt', 0)
            // let price = await getMarketPrice('BTCUSDT')
            // let newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 1).fix(1) )
            // console.log('new order 1', newOrder.orderId)
            // await setTimeout(5000)
            // let stt1 = await cancelOrder('BTCUSDT', newOrder.orderId)
            // if(stt1 == 'No order') return
            // console.log('cancel order 1', stt1)
            // price = await getMarketPrice('BTCUSDT')
            // newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 1).fix(1) )
            // console.log('new order 2', newOrder.orderId)
            // await setTimeout(5000)
            // stt1 = await cancelOrder('BTCUSDT', newOrder.orderId)
            // if(stt1 == 'No order') return
            // console.log('cancel order 2', stt1)
            // price = await getMarketPrice('BTCUSDT')
            // newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 1).fix(1) )
            // console.log('new order 3', newOrder.orderId)
            // await setTimeout(5000)
            // stt1 = await cancelOrder('BTCUSDT', newOrder.orderId)
            // if(stt1 == 'No order') return
            // console.log('cancel order 3', stt1)
            // price = await getMarketPrice('BTCUSDT')
            // newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 1).fix(1) )
            // console.log('new order 4', newOrder.orderId)
            // await setTimeout(5000)
            // stt1 = await cancelOrder('BTCUSDT', newOrder.orderId)
            // if(stt1 == 'No order') return
            // console.log('cancel order 4', stt1)
            // price = await getMarketPrice('BTCUSDT')
            // newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 1).fix(1) )
            // console.log('new order 5', newOrder.orderId)
            // await setTimeout(5000)
            // stt1 = await cancelOrder('BTCUSDT', newOrder.orderId)
            // if(stt1 == 'No order') return
            // console.log('cancel order 5', stt1)
            // price = await getMarketPrice('BTCUSDT')
            // newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 1).fix(1) )
            // console.log('new order 6', newOrder.orderId)
            // await setTimeout(5000)
            // stt1 = await cancelOrder('BTCUSDT', newOrder.orderId)
            // if(stt1 == 'No order') return
            // console.log('cancel order 6', stt1)
            // price = await getMarketPrice('BTCUSDT')
            // newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 1).fix(1) )
            // await setTimeout(5000)
            // stt1 = await cancelOrder('BTCUSDT', newOrder.orderId)
            // if(stt1 == 'No order') return
            // price = await getMarketPrice('BTCUSDT')
            // newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 1).fix(1) )
            // console.log('new order 7', newOrder.orderId)
            // await setTimeout(5000)
            let stt1 = await cancelOrder('BTCUSDT', Number(await redis.get(`orderId`)))
            console.log(`cancel original order`, stt1)
            await placeMarketOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3))
            // await redis.set('amountBuy', 0)

        // } else {
        // }
        
    } catch (error) {
        console.log('end error')
        Console.log(error)
    }

}
// await func2()
// console.log(Number(await redis.get('amountBuy')))
cron.schedule('0 0,2,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22 * * *', func, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
  
console.log('Scheduler buy started');
cron.schedule('28 0,2,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22 * * *', func1, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
  
console.log('Scheduler buy started');
cron.schedule('10 59 0,2,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22 * * *', func2, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
console.log('Scheduler sell started');


