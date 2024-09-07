import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import cron from 'node-cron'
import Binance from 'binance-api-node'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEY1,
    apiSecret: process.env.BINANCE_API_SECRET1
})
console.log(await client.ping())
const symbol = process.env.SYMBOL || 'BTCFDUSD'
let price = 0
let base = 0
let quote = 0

const getBorrowBalance = async () => {
    try {
        
        const info = await client.marginIsolatedAccount({ symbols: symbol})
        base = info.assets[0].baseAsset.free;
        quote = info.assets[0].quoteAsset.free
        return
    } catch (error) {
        throw new Error(error)
    }
}

const orderLimit = async (side,quantity, price) => {
    try {
        await client.marginOrder({
            symbol,
            isIsolated: true,
            side,
            type: 'LIMIT_MAKER',
            quantity,
            price,
            sideEffectType: side == 'BUY' ? 'MARGIN_BUY' : 'NO_SIDE_EFFECT'
        })
    } catch (error) {
        console.log('-*-')
    }
}
const cancelMarginOrders = async () => {
    try {
        const orders = await client.marginOpenOrders({
            symbol,
            isIsolated: true
        }) || []
        if(orders.length == 0) return
        for(let order of orders) {
            await client.marginCancelOrder({
                symbol,
                orderId: order.orderId,
                isIsolated: true
            })
        }
        return true
    } catch (error) {
        console.log('-')
    }
}

const placeBuyOrder = async () => {
    try {
        if(Number(quote) > 5) {
            await orderLimit('BUY', (parseFloat(quote)/(parseFloat(price)*0.998 - 0.001)).fix(5), (parseFloat(price)*0.998 - 0.001).fix(2))
        }
    } catch (error) {
        console.log(error)
    }
}

const placeSellOrder = async () => {
    try {
        if(Number(base) > 0.0001) {
            await orderLimit('SELL', (parseFloat(base)).fix(5), (parseFloat(price)- 0.1 - 0.001).fix(2))
        }
    } catch (error) {
        console.log(error)
    }
}

setInterval(() => {
    getBorrowBalance() 
},50)

client.ws.trades([symbol], trade => {
    price = parseFloat(trade.price)
})


cron.schedule('0,2,4,6,8,10,12,14,16,18,20 0 0,12,13,16,21,22 * * *', placeBuyOrder, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
cron.schedule('0 30 0,12,13,16,21,22 * * *', cancelMarginOrders, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
cron.schedule('0,2,4,6,8,10,12,14,16,18,20 59 0,12,13,16,21,22 * * *', placeSellOrder, {
    scheduled: true,
    timezone: 'Etc/GMT'
});

console.log('Scheduler sell started');

