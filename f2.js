import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import cron from 'node-cron'
import Binance from 'binance-api-node'
import { setTimeout } from 'node:timers/promises'
import { redis } from  './lib.js'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEY1,
    apiSecret: process.env.BINANCE_API_SECRET1
})
console.log(await client.ping())
const symbol = process.env.SYMBOL || 'BTCFDUSD'
const stop = parseFloat(process.env.STOP) || 0.05
const limit = parseFloat(process.env.LIMIT) || 1

const getBorrowBalance = async () => {
    try {
        
        const info = await client.marginIsolatedAccount({ symbols: symbol})
        const base = info.assets[0].baseAsset.free;
        const quote = info.assets[0].quoteAsset.free
        const borrow = info.assets[0].quoteAsset.borrowed
        return { base, quote, borrow }
    } catch (error) {
        throw new Error(error)
    }
}

const getOrderBookPrice = async () => {
    try {
        const books = await client.book({symbol})
        return {
            bid: books?.bids[0]?.price || 0,
            ask: books?.asks[0]?.price || 0
        }
    } catch (error) {
        throw new Error(error)
    }
}

const placeBatchIsolatedOrder = async () => {
    try {
        
        try {
            await cancelBatchIsolatedOrder()  
        } catch (error) {
            throw new Error()
        }
        const { base, quote } = await getBorrowBalance() 
        const { bid, ask } = await getOrderBookPrice()
        if(parseFloat(base) > parseFloat(process.env.BIT) + 0.0001) {
            await client.marginOrder({
                symbol,
                isIsolated: true,
                side: "SELL",
                type: 'STOP_LOSS_LIMIT',
                quantity: balance.fix(5),
                price: (parseFloat(bid) - limit - stop + 0.021).fix(2),
                stopPrice: (parseFloat(bid) - limit - stop + 0.011).fix(2)
            })
        } else {
            let balance = parseFloat(quote)/(parseFloat(bid) - limit)
            if(parseFloat(quote)/(parseFloat(bid) - limit) >= parseFloat(base)) balance = parseFloat(base)
            await redis.set('amt', (balance).fix(5))
            await client.marginOrder({
                symbol,
                isIsolated: true,
                side: 'BUY',
                type: 'LIMIT_MAKER',
                quantity: (Number(quote)/(parseFloat(bid) - limit)).fix(5),
                price: (parseFloat(bid) - limit + 0.011).fix(2)
            })
            await setTimeout(100)
            if(Number(base) <= 0.0001) return
            await client.marginOrder({
                symbol,
                isIsolated: true,
                side: "SELL",
                type: 'STOP_LOSS_LIMIT',
                quantity: balance.fix(5),
                price: (parseFloat(bid) - limit - stop + 0.021).fix(2),
                stopPrice: (parseFloat(bid) - limit - stop + 0.011).fix(2)
            })
        }

        return
    } catch (error) {
        console.log(error)
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
        throw new Error(error)
    }
}

const cancelBatchIsolatedOrder = async () => {
    try {
        console.log('start batch cancel')
        const orders = await client.marginOpenOrders({
            symbol,
            isIsolated: true
        })
        for(let order of orders) {
            await cancelMarginOrder(order.orderId)
        }
        return true
    } catch (error) {
        throw new Error(error)
    }
} 

cron.schedule('0 * * * * *', placeBatchIsolatedOrder, {
    scheduled: true,
    timezone: 'Etc/GMT'
});

console.log('Scheduler sell started');

