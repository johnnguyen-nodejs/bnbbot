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
        const price = await getMarketPrice('BTCUSDT')
        let count = 0
        let amountProfit = 0
        await client.ws.futuresUser(async (msg) => {
            try {
                if(msg?.eventType == 'ORDER_TRADE_UPDATE' && msg?.side == "BUY" && msg?.orderType == 'LIMIT' && msg?.orderStatus == 'FILLED') {
                    if(!handle.has(msg.eventTime)) {
                        handle.set(msg.eventTime, true)
                        await redis.set(`stt${count}`, 0)
                        amountProfit += Number(msg.quantity)
                        let stt = await cancelOrder('BTCUSDT', Number(await redis.get(`tpId`)) || 0)
                        if(stt == 'No order') {
                            amountProfit -= Number(await redis.get('amountBuy'))
                        }
                        console.log(amountProfit)
                        const stopOrder = await placeLimitOrder('BTCUSDT', 'SELL', amountProfit.fix(3), (parseFloat(msg.price)*(1 + 0.0025*(count +1) - count*0.001)).fix(1) ) 
                        console.log(`create take profit order`, stopOrder.orderId)
                        await redis.set(`amountBuy`, amountProfit)
                        await redis.set(`tpId`, stopOrder.orderId)
                        await redis.set(`stt${count}`, 1)
                        count++
                    }
                }
            } catch (error) {
                throw new Error(error)
            }
        })
        // buy action
        for(let i = 0; i < 10; i++){
            let order = await placeLimitOrder('BTCUSDT', 'BUY', (balance/(price*(0.9975 - i*0.0025))).fix(3), (price*(0.9975 - i*0.0025)).fix(1))
            await redis.set(`orderId${i}`, order.orderId)
            console.log(`create start order ${i}`, order.orderId)
        }
        return true
    } catch (error) {
        console.log(error)
    }
}
const func2 = async () => {
    try {
        for(let i = 9; i >= 0; i--){
            if(Number(await redis.get(`stt${i}`)) == 1) {
                await redis.set(`stt${i}`, 0)
                let stt = await cancelOrder('BTCUSDT', Number(await redis.get(`tpId`)) || 0)
                if(stt == 'No order') continue
                console.log(`cancel take profit order ${i}`, stt)
            } else {
                const stt = await cancelOrder('BTCUSDT', Number(await redis.get(`orderId${i}`)))
                console.log(`cancel original order ${i}`, stt)
            }
            
        }
        let price = await getMarketPrice('BTCUSDT')
        let newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 0.2).fix(1) )
        console.log('new order 1', newOrder.orderId)
        await setTimeout(5000)
        stt = await cancelOrder('BTCUSDT', newOrder.orderId)
        if(stt == 'No order') return
        console.log('cancel order 1', stt)
        price = await getMarketPrice('BTCUSDT')
        newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 0.2).fix(1) )
        console.log('new order 2', newOrder.orderId)
        await setTimeout(5000)
        stt = await cancelOrder('BTCUSDT', newOrder.orderId)
        if(stt == 'No order') return
        console.log('cancel order 2', stt)
        price = await getMarketPrice('BTCUSDT')
        newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 0.2).fix(1) )
        console.log('new order 3', newOrder.orderId)
        await setTimeout(5000)
        stt = await cancelOrder('BTCUSDT', newOrder.orderId)
        if(stt == 'No order') return
        console.log('cancel order 3', stt)
        price = await getMarketPrice('BTCUSDT')
        newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 0.2).fix(1) )
        console.log('new order 4', newOrder.orderId)
        await setTimeout(5000)
        stt = await cancelOrder('BTCUSDT', newOrder.orderId)
        if(stt == 'No order') return
        console.log('cancel order 4', stt)
        price = await getMarketPrice('BTCUSDT')
        newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 0.2).fix(1) )
        console.log('new order 5', newOrder.orderId)
        await setTimeout(5000)
        stt = await cancelOrder('BTCUSDT', newOrder.orderId)
        if(stt == 'No order') return
        console.log('cancel order 5', stt)
        price = await getMarketPrice('BTCUSDT')
        newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 0.2).fix(1) )
        console.log('new order 6', newOrder.orderId)
        await setTimeout(5000)
        stt = await cancelOrder('BTCUSDT', newOrder.orderId)
        if(stt == 'No order') return
        console.log('cancel order 6', stt)
        price = await getMarketPrice('BTCUSDT')
        newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 0.2).fix(1) )
        await setTimeout(5000)
        stt = await cancelOrder('BTCUSDT', newOrder.orderId)
        if(stt == 'No order') return
        price = await getMarketPrice('BTCUSDT')
        newOrder = await placeLimitOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3), (price + 0.2).fix(1) )
        console.log('new order 7', newOrder.orderId)
        await setTimeout(5000)
        stt = await cancelOrder('BTCUSDT', newOrder.orderId)
        if(stt == 'No order') return
        console.log('cancel order 7', stt)
        await placeMarketOrder('BTCUSDT', 'SELL', Number(await redis.get('amountBuy')).fix(3))
        await redis.set('amountBuy', 0)
        
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
cron.schedule('10 59 * * * *', func2, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
console.log('Scheduler sell started');


