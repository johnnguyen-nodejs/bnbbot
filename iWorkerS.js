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
let bs = 0 // virtual bit
let caps = 0 // virtual capital
let btcA = 0
let price = 0
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
        console.log('S', error.message)
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
    const index = sIds.findIndex(item => item.id === id);
    if (index !== -1) {
    sIds.splice(index, 1);
    }
}


setInterval(() => {
    if(sIds.length >= 2) {
        for(const order of sIds) {
            cancel(order.id)
        }
    }
},100)
setInterval(() => {
    if(bs > 0.0001 && caps/bs > 50000) {
        console.log(bs, caps, price, (caps/bs + 0.001).toFixed(2))
        if(price > caps/bs) {
            caps = price*bs
            order(bs.fix(5), (price+ 0.001).toFixed(2))
        } else {
            order(bs.fix(5), (caps/bs + 0.001).toFixed(2))
        }
    }
},100)
parentPort.on('message',async (message) => {
    const { a, p } = message
    price = p
    if(Number(a) > 0) {
        bs += Number(a)
        caps += Number(a)*Number(p)
        console.log('o', Number(a), Number(a)*Number(p))
        console.log(bs, caps)
        if(btcA > bs && bs > 0.0001 && caps/bs > 50000) {
            order(bs.toFixed(5), (caps/bs).toFixed(2))
        }

    }
})

client.ws.marginUser(msg => {
    if(msg.eventType == 'outboundAccountPosition') {
        btcA = parseFloat(msg.balances[0].free)
    }
    if(msg.eventType == 'executionReport' && msg.side == 'SELL') {
        if(msg.orderStatus == 'NEW') {
            bs -= Number(msg.quantity)
            caps -= Number(msg.quantity)*Number(msg.price)
            if(bs <  -0.00001) {
                cancel(msg.orderId)
            }
            sIds.push({
                id: msg.orderId,
                a: msg.quantity,
                p: msg.price
            })
            console.log(1,bs,caps, sIds)
        }
        if(msg.orderStatus == 'FILLED') {
            updateArr(msg.orderId)
            console.log(2,bs,caps, sIds)
        }
        if(msg.orderStatus == 'CANCELED') {
            bs += Number(msg.quantity) - Number(msg.totalTradeQuantity)
            caps += Number(msg.quantity)*Number(msg.price) - Number(msg.totalQuoteTradeQuantity)
            updateArr(msg.orderId)
            console.log(3, bs, caps, sIds)
        }
    }
})

