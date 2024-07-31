import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import cron from 'node-cron'
import Binance from 'binance-api-node'
import { setTimeout } from 'node:timers/promises'
import { redis } from  './lib.js'
import crypto from 'crypto'
import axios from 'axios'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
})
console.log(await client.ping())
const transformObject = (obj) => {
    let jsonString = JSON.stringify(obj);
    jsonString = jsonString.replace(/:/g, '=');
    jsonString = jsonString.replace(/,/g, '?');
    jsonString = jsonString.replace(/[{}]/g, '');

    return jsonString;
}
const symbol = process.env.SYMBOL || 'BTCFDUSD'
const stop = parseFloat(process.env.STOP) || 0.05
const limit = parseFloat(process.env.LIMIT) || 1
let count = Number(await redis.get('count')) || 0
let off = Number(await redis.get('off')) || 0

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
        console.log(count, off)
        const { base, quote } = await getBorrowBalance() 
        const { bid, ask } = await getOrderBookPrice()
        let balance = parseFloat(quote)/(parseFloat(bid) - limit)
        if(parseFloat(quote)/(parseFloat(bid) - limit) >= parseFloat(base)) balance = parseFloat(base)
        await redis.set('amt', (balance).fix(5))
        try {
            count += 1
            redis.set('count', count)
            const limitOrder = await client.marginOrder({
                symbol,
                isIsolated: true,
                side: 'BUY',
                type: 'LIMIT_MAKER',
                quantity: (Number(quote)/(parseFloat(bid) - limit)).fix(5),
                price: (parseFloat(bid) - limit + 0.011).fix(2)
            })
            await setTimeout(100)
            if(Number(base) <= 0.0001) return
            const stoplossOrder = await client.marginOrder({
                symbol,
                isIsolated: true,
                side: "SELL",
                type: 'STOP_LOSS_LIMIT',
                quantity: balance.fix(5),
                price: (parseFloat(bid) - limit - stop + 0.021).fix(2),
                stopPrice: (parseFloat(bid) - limit - stop + 0.011).fix(2)
            })
            
        } catch (error) {
            off += 1
            redis.set('off', off)
            console.error('trigger error');
            const { bid, ask } = await getOrderBookPrice()
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
            // Promise.all([limitOrder, stoplossOrder])
            // .then(responses => {
            //     console.log('order success')
            // })
            // .catch(error => {
            //     console.error('trigger error');
            // });
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

const updateBatchIsolatedOrder = async () => {
    try { 
        const orders = await client.marginOpenOrders({
            symbol,
            isIsolated: true
        })
        if(orders.length >= 1 && (orders[0]?.type == 'LIMIT_MAKER' || orders[1]?.type == 'LIMIT_MAKER')) {
            let t = 0
            try {
                
                for(let order of orders) {
                    const result = await cancelMarginOrder(order.orderId)
                    if(result == 'no') t = 1
                }
            } catch (error) {
                t = 1
                throw new Error(error)
            }
            if(t == 1) return
            await placeBatchIsolatedOrder()
        }
        return true
    } catch (error) {
        console.log(error)
    }
}

const updateStoplossIsolatedOrder = async () => {
    try {
        const orders = await client.marginOpenOrders({
            symbol,
            isIsolated: true
        })
        if((orders?.length == 1 && orders[0]?.type == 'STOP_LOSS_LIMIT' && orders[0]?.status == 'NEW') || (orders.length == 2 && ((orders[0].type == 'STOP_LOSS_LIMIT' && orders[0].status == 'NEW' && orders[1].type == 'LIMIT_MAKER' && orders[1].status != 'NEW') || (orders[1].type == 'STOP_LOSS_LIMIT' && orders[1].status == 'NEW' && orders[0].type == 'LIMIT_MAKER' && orders[0].status != 'NEW')))) {
            await cancelMarginOrder(orders[0].orderId)
            await client.marginOrder({
                symbol,
                isIsolated: true,
                side: "SELL",
                type: 'STOP_LOSS_LIMIT',
                quantity: parseFloat(await redis.get('amt')),
                price: (parseFloat(orders[0].price) + 1).fix(2),
                stopPrice: (parseFloat(orders[0].price) + 0.9).fix(2)
            })
            return true
        }
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

const sellFunc = async () => {
    try {
        try {
            const orders = await client.marginOpenOrders({
                symbol,
                isIsolated: true
            })
            for(let order of orders) {
                await cancelMarginOrder(order.orderId)
            }
        } catch (error) {
            throw new Error(error)
        }
        const { base, quote } = await getBorrowBalance()
        const { bid, ask } = await getOrderBookPrice()
        if(parseFloat(base) > parseFloat(process.env.BIT) + 0.0001) {
            try {
                
                await client.marginOrder({
                    symbol,
                    isIsolated: true,
                    side: 'SELL',
                    type: 'LIMIT_MAKER',
                    quantity: (parseFloat(base) - parseFloat(process.env.BIT)).fix(5),
                    price: (parseFloat(ask) + limit + 0.011 ).fix(2)
                })
            } catch (error) {
                throw new Error(error)
            }
            return console.log('sell end')
        }
        return
    } catch (error) {
        console.log(error)
    }
} 

cron.schedule('0 * * * * *', placeBatchIsolatedOrder, {
    scheduled: true,
    timezone: 'Etc/GMT'
});

cron.schedule('2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40 * * * * *', updateStoplossIsolatedOrder, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
  
cron.schedule('43 * * * * *', cancelBatchIsolatedOrder, {
    scheduled: true,
    timezone: 'Etc/GMT'
});

cron.schedule('45,47,49,51,53,55 * * * * *', sellFunc, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
console.log('Scheduler sell started');

