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
        const usdtBalance = accountInfo.assets.find(asset => asset.asset === 'USDC').availableBalance;
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
        await redis.set('stt', 0)
        const balance = await getUSDBalance()
        const price = (await getMarketPrice('BTCUSDC'))*0.997
        await client.ws.futuresUser(async (msg) => {
            try {
                // console.log(msg)
                if(msg?.eventType == 'ORDER_TRADE_UPDATE' && msg?.side == "BUY" && msg?.orderType == 'LIMIT' && msg?.orderStatus == 'FILLED') {
                    if(!handle.has(msg.eventTime)) {
                        handle.set(msg.eventTime, true)
                        await cancelOrder('BTCUSDC', Number(await redis.get('tpId')))
                        // await cancelOrder('BTCUSDC', Number(await redis.get('tpId1')))
                        // await cancelOrder('BTCUSDC', Number(await redis.get('tpId2')))
                        // await cancelOrder('BTCUSDC', Number(await redis.get('tpId3')))
                        await redis.set('amountBuy', msg?.quantity)
                        const amount0 = Number(msg.quantity).fix(3)
                        // const amount1 = (Number(msg.quantity)/4).fix(3)
                        // const amount2 = (Number(msg.quantity)/4).fix(3)
                        // const amount3 = Number(msg.quantity) - amount0 - amount1 - amount2
                        const stopOrder = await placeLimitOrder('BTCUSDC', 'SELL', amount0, (parseFloat(msg?.price)/0.997).fix(1) ) 
                        console.log('create take profit order 1', stopOrder.orderId)
                        await redis.set('tpId', stopOrder.orderId)
                        // await redis.set('tp0Amount', amount0)
                        // const stopOrder1 = await placeLimitOrder('BTCUSDC', 'SELL', amount1, (parseFloat(msg?.price)*1.0005/0.9962).fix(1) ) 
                        // console.log('create take profit order 1', stopOrder1.orderId)
                        // await redis.set('tpId1', stopOrder1.orderId)
                        // await redis.set('tp1Amount', amount1)
                        // const stopOrder2 = await placeLimitOrder('BTCUSDC', 'SELL', amount2, (parseFloat(msg?.price)*1.001/0.9962).fix(1) ) 
                        // console.log('create take profit order 2', stopOrder2.orderId)
                        // await redis.set('tpId2', stopOrder2.orderId)
                        // await redis.set('tp2Amount', amount2)
                        // const stopOrder3 = await placeLimitOrder('BTCUSDC', 'SELL', amount3.fix(3), (parseFloat(msg?.price)*1.0015/0.9962).fix(1) ) 
                        // console.log('create take profit order 3', stopOrder3.orderId)
                        // await redis.set('tpId3', stopOrder3.orderId)
                        // await redis.set('tp3Amount', amount3)
                        await redis.set('stt', 1)

                    }
                }
            } catch (error) {
                throw new Error(error)
            }
        })
        const order = await placeLimitOrder('BTCUSDC', 'BUY', (balance*5/price).fix(3), price.fix(1))
        await redis.set('orderId', order.orderId)
        console.log('create start order', order.orderId)
        return true
    } catch (error) {
        console.log(error)
    }
}
const func2 = async () => {
    try {
        if(Number(await redis.get('stt')) == 1) {
            // let newMount = Number(await redis.get('amountBuy'))
            // console.log(newMount)
            await redis.set('stt', 0)
            // let st3 = await cancelOrder('BTCUSDC', Number(await redis.get('tpId3')) || 0)
            // if(st3 != 'No order') newMount -= Number(await redis.get('tp3Amount'))
            // console.log(newMount)
            // let tp2 = await cancelOrder('BTCUSDC', Number(await redis.get('tpId2')) || 0)
            // if(tp2 != 'No order') newMount -= Number(await redis.get('tp2Amount'))
            // console.log(newMount)
            // let tp1 = await cancelOrder('BTCUSDC', Number(await redis.get('tpId1')) || 0)
            // if(tp1 != 'No order') newMount -= Number(await redis.get('tp1Amount'))
            // console.log(newMount)
            let stt = await cancelOrder('BTCUSDC', Number(await redis.get('tpId')) || 0)
            if(stt == 'No order') return
            console.log('cancel take profit order', stt)
            // let price = await getMarketPrice('BTCUSDC')
            // let newOrder = await placeLimitOrder('BTCUSDC', 'SELL', Number(await redis.get('amountBuy')), (price + 0.2).fix(1) )
            // console.log('new order 1', newOrder.orderId)
            // await setTimeout(5000)
            // stt = await cancelOrder('BTCUSDC', newOrder.orderId)
            // if(stt == 'No order') return
            // console.log('cancel order 1', stt)
            // price = await getMarketPrice('BTCUSDC')
            // newOrder = await placeLimitOrder('BTCUSDC', 'SELL', Number(await redis.get('amountBuy')), (price + 0.2).fix(1) )
            // console.log('new order 2', newOrder.orderId)
            // await setTimeout(5000)
            // stt = await cancelOrder('BTCUSDC', newOrder.orderId)
            // if(stt == 'No order') return
            // console.log('cancel order 2', stt)
            // price = await getMarketPrice('BTCUSDC')
            // newOrder = await placeLimitOrder('BTCUSDC', 'SELL', Number(await redis.get('amountBuy')), (price + 0.2).fix(1) )
            // console.log('new order 3', newOrder.orderId)
            // await setTimeout(5000)
            // stt = await cancelOrder('BTCUSDC', newOrder.orderId)
            // if(stt == 'No order') return
            // console.log('cancel order 3', stt)
            // price = await getMarketPrice('BTCUSDC')
            // newOrder = await placeLimitOrder('BTCUSDC', 'SELL', Number(await redis.get('amountBuy')), (price + 0.2).fix(1) )
            // console.log('new order 4', newOrder.orderId)
            // await setTimeout(5000)
            // stt = await cancelOrder('BTCUSDC', newOrder.orderId)
            // if(stt == 'No order') return
            // console.log('cancel order 4', stt)
            // price = await getMarketPrice('BTCUSDC')
            // newOrder = await placeLimitOrder('BTCUSDC', 'SELL', Number(await redis.get('amountBuy')), (price + 0.2).fix(1) )
            // console.log('new order 5', newOrder.orderId)
            // await setTimeout(5000)
            // stt = await cancelOrder('BTCUSDC', newOrder.orderId)
            // if(stt == 'No order') return
            // console.log('cancel order 5', stt)
            // price = await getMarketPrice('BTCUSDC')
            // newOrder = await placeLimitOrder('BTCUSDC', 'SELL', Number(await redis.get('amountBuy')), (price + 0.2).fix(1) )
            // console.log('new order 6', newOrder.orderId)
            // await setTimeout(5000)
            // stt = await cancelOrder('BTCUSDC', newOrder.orderId)
            // if(stt == 'No order') return
            // console.log('cancel order 6', stt)
            // price = await getMarketPrice('BTCUSDC')
            // newOrder = await placeLimitOrder('BTCUSDC', 'SELL', Number(await redis.get('amountBuy')), (price + 0.2).fix(1) )
            // await setTimeout(5000)
            // stt = await cancelOrder('BTCUSDC', newOrder.orderId)
            // if(stt == 'No order') return
            // price = await getMarketPrice('BTCUSDC')
            // newOrder = await placeLimitOrder('BTCUSDC', 'SELL', Number(await redis.get('amountBuy')), (price + 0.2).fix(1) )
            // console.log('new order 7', newOrder.orderId)
            // await setTimeout(5000)
            // stt = await cancelOrder('BTCUSDC', newOrder.orderId)
            // if(stt == 'No order') return
            // console.log('cancel order 7', stt)
            await placeMarketOrder('BTCUSDC', 'SELL', Number(await redis.get('amountBuy')).fix(3))
            console.log('new market order')
        } else {
            const stt = await cancelOrder('BTCUSDC', Number(await redis.get('orderId')))
            console.log('cancel original order', stt)
        }
        
        
    } catch (error) {
        console.log('no cancel order 2')
        Console.log(error)
    }

}
// await func()
// console.log(Number(await redis.get('amountBuy')))
cron.schedule('0 * * * *', func, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
  
console.log('Scheduler buy started');
cron.schedule('50 59 * * * *', func2, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
console.log('Scheduler sell started');


