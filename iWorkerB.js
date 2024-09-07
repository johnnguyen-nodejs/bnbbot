import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
const bPending = []
const bNew = []
let price = []
const order = async (quantity, price, newClientOrderId) => {
    try {
        const order = await client.marginOrder({
            symbol: 'BTCFDUSD',
            side: 'BUY',
            type: 'LIMIT_MAKER',
            quantity,
            price,
            newClientOrderId
        });
        return order;
    } catch (error) {
        console.log('B', error.message)
    }
};

const cancel = async (orderId) => {
    try {
        await client.marginCancelOrder({
            symbol: 'BTCFDUSD',
            orderId
        })
    } catch (error) {
        console.log(error.message)
    }
}

setInterval(async () => {
    if(bPending.length > 0){
        let a = 0
        let c = 0
        let id = bPending[0].id
        for(const odr of bPending.sort((a,b) => Number(b.p) - Number(a.p))) {
            a += Number(odr.a)
            c += Number(odr.a)*Number(odr.p)
        }
        bPending.length = 0
        bPending.push({
            id,
            a: a.toFixed(5),
            p: (c/a).toFixed(2)
        })
        if(price < c/a) {
            order(a.fix(5), price, id)
        } else {
            order(a.fix(5), (c/a).toFixed(2), id)
        }
    }
}, 1000)

const updateArr = (id) => {
    const index = bPending.findIndex(item => item.id === id);
    
    if (index !== -1) {
    bPending.splice(index, 1);
    }
}

parentPort.on('message', (message) => {
    const { a, p, id} = message
    price = p
    if(Number(a) > 0) {
        bPending.push({
            id,
            a,
            p
        })
        order(Number(a), Number(p), id)
        
    }
})

client.ws.marginUser(async msg => {
    if(msg.eventType == 'executionReport' && msg.side == 'BUY') {
        if(msg.orderStatus == 'NEW') {
           updateArr(msg.newClientOrderId)
           bNew.push({
               id: msg.newClientOrderId,
               a: msg.quantity,
               p: msg.price
           })
        }
        if(msg.orderStatus == 'CANCELED') {
            bPending.push({
                id: msg.newClientOrderId,
                a: msg.quantity,
                p: msg.price
            })
         }
    }
})
