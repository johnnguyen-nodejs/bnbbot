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
    let count = Number(await redis.get('count1')) || 0
    let off = Number(await redis.get('off1')) || 0
    try {
        console.log(count, off)
        redis.set('count1', count+1)
        const orders = await client.marginOpenOrders({
            symbol,
            isIsolated: true
        })
        try {
            console.log('start batch cancel')
            for(let order of orders) {
                await cancelMarginOrder(order.orderId)
            }
        } catch (error) {
            throw new Error()
        }
        const { base, quote } = await getBorrowBalance() 
        console.log(base, quote)
        const { bid, ask } = await getOrderBookPrice()
        if(orders?.length == 1 && orders[0]?.type == 'STOP_LOSS_LIMIT' && orders[0].status == 'NEW' || Number(base) > parseFloat(process.env.BIT) + 0.00005) {
            await client.marginOrder({
                symbol,
                isIsolated: true,
                side: "SELL",
                type: 'STOP_LOSS_LIMIT',
                quantity: (parseFloat(base) - parseFloat(process.env.BIT)).fix(5),
                price: (parseFloat(bid) - 5 + 0.021).fix(2),
                stopPrice: (parseFloat(bid) - 5 + 0.011).fix(2)
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
        redis.set('off1', off+1)
        console.log(error)
    }
}

const updatePlaceOrder = async () => {
    try {
        const orders = await client.marginOpenOrders({
            symbol,
            isIsolated: true
        })
        const limitOrder = orders?.filter(order => order.type == 'LIMIT_MAKER' && order.status == 'NEW')
        const stoplossOrder = orders?.filter(order => order.type == 'STOP_LOSS_LIMIT' && order.status == 'NEW')
        if(limitOrder.length == 1) {
            await placeBatchIsolatedOrder()
        }
        if(stoplossOrder.length == 1 && limitOrder.length == 0) {
            await cancelMarginOrder(stoplossOrder[0].orderId)
            await client.marginOrder({
                symbol,
                isIsolated: true,
                side: "SELL",
                type: 'STOP_LOSS_LIMIT',
                quantity: parseFloat(stoplossOrder[0].origQty),
                price: (parseFloat(stoplossOrder[0].price)+ 3 + 0.021).fix(2),
                stopPrice: (parseFloat(stoplossOrder[0].price)+ 3 + 0.011).fix(2)
            })
        }
        if(stoplossOrder.length == 0 && limitOrder.length == 0) {
            const { base, quote } = await getBorrowBalance() 
            const { bid, ask } = await getOrderBookPrice()
            if((Number(base) - Number(process.env.BIT)).fix(5) > 0) {
                await client.marginOrder({
                    symbol,
                    isIsolated: true,
                    side: "SELL",
                    type: 'STOP_LOSS_LIMIT',
                    quantity: (parseFloat(base) - parseFloat(process.env.BIT)).fix(5),
                    price: (parseFloat(bid)-limit -stop + 0.021).fix(2),
                    stopPrice: (parseFloat(bid)-limit -stop + 0.011).fix(2)
                })
            }
        }
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

cron.schedule('0 * * * * *', placeBatchIsolatedOrder, {
    scheduled: true,
    timezone: 'Etc/GMT'
});

cron.schedule('6,10,14,18,22,26,30,34,38,42,46,50,54,58 * * * * *', updatePlaceOrder, {
    scheduled: true,
    timezone: 'Etc/GMT'
});

console.log('Scheduler sell started');

