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
const symbol = 'BTCFDUSD'
const stop = 0.05
const limit = 1
let count = 0
let off = 0

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
        const { base, quote } = await getBorrowBalance() 
        const { bid, ask } = await getOrderBookPrice()
        let balance = Number(quote)/(parseFloat(bid) - limit)
        if(Number(quote)/(parseFloat(bid) - limit) >= Number(base)) balance = Number(base)
        await redis.set('amt', (balance).fix(5))
        try {
            const limitOrder = await client.marginOrder({
                symbol,
                isIsolated: true,
                side: 'BUY',
                type: 'LIMIT',
                quantity: (Number(quote)/(parseFloat(bid) - limit)).fix(5),
                price: (parseFloat(bid) - limit + 0.011).fix(2),
                sideEffectType: 'MARGIN_BUY'
            })
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
            console.error('trigger error');
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
        if(!order?.orderId || order?.status == 'FILLED' || order?.status == 'PARTIALLY_FILLED') return 'no'
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
        if(orders.length >= 1 && (orders[0]?.type == 'LIMIT' || orders[1]?.type == 'LIMIT')) {
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
        if(Number(quote)/(Number(base)*Number(ask)) <= 0.3) {

            await client.marginOrder({
                symbol,
                isIsolated: true,
                side: 'SELL',
                type: 'LIMIT',
                quantity: await redis.get('amt') || 0.00014,
                price: (parseFloat(ask) + 1.011 ).fix(2)
            })
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

cron.schedule('2,4,6,8,10 * * * * *', updateBatchIsolatedOrder, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
  
cron.schedule('40 * * * * *', cancelBatchIsolatedOrder, {
    scheduled: true,
    timezone: 'Etc/GMT'
});

cron.schedule('45,47,49,51,53,55 * * * * *', sellFunc, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
console.log('Scheduler sell started');

