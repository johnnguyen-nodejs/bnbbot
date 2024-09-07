import * as dotenv from 'dotenv'
dotenv.config()
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
import "./prototype.js"
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})

class Sell {
    constructor() {
        this.sIds = []
        this.bs = 0
        this.caps = 0
        this.profit = 0
        this.btcA = 0
        this.price = 0
        this.cancelAll()
        this.reOrder()
        this.event()
    }

    async order(quantity, price){
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
    
    async cancel(orderId){
        try {
            await client.marginCancelOrder({
                symbol: 'BTCFDUSD',
                orderId
            })
        } catch (error) {
            console.log('-')
        }
    }
    
    updateArr(arr, id){
        const index = arr.findIndex(item => item.i === id);
        if (index !== -1) {
            arr.splice(index, 1);
        }
    }

    cancelAll(){
        setInterval(() => {
            if(this.sIds.length >= 2) {
                for(const order of this.sIds) {
                    this.cancel(order.i)
                }
            }
        },100)
    }
    reOrder() {
        setInterval(() => {
            if(this.bs > 0.0001 && this.caps/this.bs > 50000) {
                this.order(this.bs.toFixed(5), (this.caps/this.bs + 0.001).toFixed(2))
            }
        },100)
    }

    event(){
        client.ws.marginUser(msg => {
            if(msg.eventType == 'executionReport' && msg.side == 'SELL') {
                if(msg.orderStatus == 'NEW') {
                    this.bs -= Number(msg.quantity)
                    this.caps -= Number(msg.quantity)*Number(msg.price)
                    this.sIds.push({
                        i: msg.orderId,
                        a: msg.quantity,
                        p: msg.price
                    })
                    console.log(1, this.bs, this.caps)
                }
                if(msg.orderStatus == 'FILLED') {
                    this.updateArr(this.sIds, msg.orderId)
                    console.log(2, this.bs, this.caps)
                }
                if(msg.orderStatus == 'CANCELED') {
                    this.bs += Number(msg.quantity) - Number(msg.totalTradeQuantity)
                    this.caps += Number(msg.quantity)*Number(msg.price) - Number(msg.totalQuoteTradeQuantity)
                    this.updateArr(this.sIds, msg.orderId)
                    console.log(3, this.bs, this.caps)
                }
            }
        })
    }

    worker(){
        parentPort.on('message',async (message) => {
            const { a, p } = message
            this.bs += Number(a)
            this.caps += Number(a)*Number(p)
            this.profit += 4*Number(a)
            console.log(0, this.bs, this.caps)
            if(this.bs > 0.0001 && this.caps/this.bs > 50000) {
                if(p > this.caps/this.bs) {
                    this.caps = p*this.bs
                    this.order(this.bs.toFixed(5), (p + 0.001).toFixed(2))
                } else {
                    this.order(this.bs.toFixed(5), (this.caps/this.bs + 0.001).toFixed(2))
                }
            }
        })
    }

}

const sell = new Sell()
sell.worker()








