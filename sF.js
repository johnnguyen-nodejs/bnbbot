import * as dotenv from 'dotenv'
dotenv.config()
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
import "./prototype.js"
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
let sIds = []
let bs = 0
let caps = 0
let profit = 0
const order = async (quantity, price) => {
    try {
        if(Number(quantity) < 0.0001) return
        const order = await client.marginOrder({
            symbol: 'BTCFDUSD',
            side: 'SELL',
            type: 'LIMIT_MAKER',
            quantity,
            price
        });
        return order;
    } catch (error) {
        console.log('-')
    }
};
const cancel = async (orderId) => {
    try {
        await client.marginCancelOrder({
            symbol: 'BTCFDUSD',
            orderId
        })
    } catch (error) {
        console.log('-')
    }
}

const updateArr = (id) => {
    const index = sIds.findIndex(item => item.i === id);
    
    if (index !== -1) {
    sIds.splice(index, 1);
    }
}


setInterval(() => {
    if(sIds.length >= 2) {
        for(const order of sIds) {
            cancel(order.i)
        }
    }
},100)

setInterval(() => {
    if(bs > 0.0001 && caps/bs > 50000) {
        console.log(bs, caps)
        parentPort.postMessage({a: bs, p: caps/bs })
        order(bs.toFixed(5), (caps/bs + 0.001).toFixed(2))
    }
    if(bs < 0.0001 && sIds.length == 0) {
        parentPort.postMessage({a: 0, p: 0})
    }
},100)
parentPort.on('message',async (message) => {
    const { a, p, stop } = message
    if(a == 0) {
        sIds.length = 0
    } else {
        bs += Number(a)
        caps += Number(a)*Number(p)
        profit += 4*Number(a)
        console.log(0, bs, caps)
        if(bs > 0.0001 && caps/bs > 50000) {
            if(p > caps/bs) {
                caps = p*bs
                order(bs.toFixed(5), (p + 0.001).toFixed(2))
            } else {
                order(bs.toFixed(5), (caps/bs + 0.001).toFixed(2))
            }
        }
    }
})

client.ws.marginUser(msg => {
    if(msg.eventType == 'executionReport' && msg.side == 'SELL') {
        if(msg.orderStatus == 'NEW') {
            bs -= Number(msg.quantity)
            caps -= Number(msg.quantity)*Number(msg.price)
            sIds.push({
                i: msg.orderId,
                a: msg.quantity,
                p: msg.price
            })
            console.log(1, bs, caps)
        }
        if(msg.orderStatus == 'FILLED') {
            updateArr(msg.orderId)
            console.log(2, bs, caps)
        }
        if(msg.orderStatus == 'CANCELED') {
            bs += Number(msg.quantity) - Number(msg.totalTradeQuantity)
            caps += Number(msg.quantity)*Number(msg.price) - Number(msg.totalQuoteTradeQuantity)
            updateArr(msg.orderId)
            console.log(3, bs, caps)
        }
    }
})

