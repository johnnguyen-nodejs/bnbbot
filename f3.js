import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import cron from 'node-cron'
import Binance from 'binance-api-node'
import { redis } from  './lib.js'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEY1,
    apiSecret: process.env.BINANCE_API_SECRET1
})
console.log(await client.ping())
const symbol = process.env.SYMBOL || 'BTCFDUSD'
const stop = parseFloat(process.env.STOP) || 0.05
const limit = parseFloat(process.env.LIMIT) || 1
let price = 0
let base = 0
let quote = 0
let orders = []

const getBorrowBalance = async () => {
    try {
        
        const info = await client.marginIsolatedAccount({ symbols: symbol})
        base = info.assets[0].baseAsset.free;
        quote = info.assets[0].quoteAsset.free
        return
    } catch (error) {
        console.log('oo')
    }
}
const getOrders = async () => {
    try {
        orders = await client.marginOpenOrders({
            symbol,
            isIsolated: true
        })
    } catch (error) {
        throw new Error(error)
    }
}
const orderLimit = async (quantity, price) => {
    try {
        await client.marginOrder({
            symbol,
            isIsolated: true,
            side: 'BUY',
            type: 'LIMIT_MAKER',
            quantity,
            price
        })
    } catch (error) {
        console.log('-*-')
    }
}
const cancelMarginOrder = async (orderId) => {
    try {
        const order = await client.marginGetOrder({
            symbol,
            orderId,
            isIsolated: true
        })
        if(!order?.orderId || order?.status != 'NEW') return 'no'
        await client.marginCancelOrder({
            symbol,
            orderId,
            isIsolated: true
        })
        return true
    } catch (error) {
        console.log('-----')
    }
}
const orderStoploss = async (quantity, price, stopPrice) => {
    try {
        await client.marginOrder({
            symbol,
            isIsolated: true,
            side: "SELL",
            type: 'STOP_LOSS_LIMIT',
            quantity,
            price,
            stopPrice
        })
    } catch (error) {
        let off = Number(await redis.get('off1')) || 0
        console.log('*-*')
        redis.set('off1', off + 1)
    }
}


const placeBatchIsolatedOrder = async () => {
    let count = Number(await redis.get('count1')) || 0
    let off = Number(await redis.get('off1')) || 0
    try {
        console.log(count, off)
        redis.set('count1', count+1)
        try {
            console.log('start batch cancel')
            for(let order of orders) {
                cancelMarginOrder(order.orderId)
            }
        } catch (error) {
            console.log('-----')
        }
        
        if(orders?.length == 1 && orders[0]?.type == 'STOP_LOSS_LIMIT' && orders[0].status == 'NEW' || Number(base) > parseFloat(process.env.BIT) + 0.00005) {
            orderStoploss((parseFloat(base) - parseFloat(process.env.BIT)).fix(5), (parseFloat(price) - limit - stop + 0.021).fix(2), (parseFloat(price) - limit -stop + 0.011).fix(2))
        } else {
            let balance = parseFloat(quote)/(parseFloat(price) - limit + 0.011)
            orderLimit(balance.fix(5), (parseFloat(price) - limit + 0.011).fix(2))
            if(Number(base) <= 0.0001) return
            orderStoploss(balance.fix(5), (parseFloat(price) - limit - stop + 0.021).fix(2), (parseFloat(price) - limit - stop + 0.011).fix(2))
        }
        console.log(base, quote)
        return
    } catch (error) {

        console.log(error)
    }
}

const updateBatchIsolatedOrder = async () => {
    try {
        if(Number(base) > parseFloat(process.env.BIT) + 0.00005) {
            orderStoploss((parseFloat(base) - parseFloat(process.env.BIT)).fix(5), (parseFloat(price) - limit - stop + 0.021).fix(2), (parseFloat(price) - limit -stop + 0.011).fix(2))
        }
        return
    } catch (error) {

        console.log(error)
    }
}

client.ws.trades([symbol], trade => {
    price = parseFloat(trade.price)
})

setInterval(() => {
    getBorrowBalance() 
},50)

setInterval(() => {
    updateBatchIsolatedOrder() 
},100)

cron.schedule('0 * * * * *', placeBatchIsolatedOrder, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
cron.schedule('59 * * * * *', getOrders, {
    scheduled: true,
    timezone: 'Etc/GMT'
});

console.log('Scheduler sell started');

