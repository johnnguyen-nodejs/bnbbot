import * as dotenv from 'dotenv'
dotenv.config()
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
import "./prototype.js"
import Queue from 'bull'
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
const myQueue = new Queue('sell', {
    redis: { host: '127.0.0.1', port: 6379 }
})


class Sell {
    constructor() {
        this.btcA = 0
        this.price = 0
        this.sIds = []
        this.mark = new Map()
        this.a  = 0
        this.e = 0
        this.s = 0
        this.reCancel()
        this.event()
    }
    async order(quantity, price){
        try {
            const order = await client.marginOrder({
                symbol: 'BTCFDUSD',
                side: 'SELL',
                type: 'LIMIT_MAKER',
                quantity,
                price
            });
            return order;
        } catch (error) {
            const now = Date.now()
            this.e++
            const obj = {
                time: now,
                type: 'SELL',
                quantity,
                price,
                stt: 'ERROR',
                eRate: (this.s*100/(this.s + this.e)).toFixed(2)
            }
            parentPort.postMessage(obj)
            // this.tradeDb.put(now, obj)           
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

    reCancel(){
        setInterval(() => {
            if(this.sIds.length >= 1) {
                for(const order of this.sIds) {
                    this.cancel(order)
                }
            }
        },1000)
    }


    async updateArr(arr, id) {
        const index = arr.findIndex(item => item === id);
        if (index !== -1) {
            arr.splice(index, 1);
        }
    }

    event(){
        client.ws.marginUser(msg => {
            if(msg.eventType == 'outboundAccountPosition') {
                this.btcA = parseFloat(msg.balances[0].free)
            }
            if(msg.eventType == 'executionReport' && msg.side == 'SELL' && Number(msg.quantity) <= this.a + 0.00001) {
                if(msg.orderStatus == 'NEW') {
                    this.sIds.push(msg.orderId)
                }
                if(msg.orderStatus == 'FILLED') {
                    this.updateArr(this.sIds, msg.orderId)
                    this.s++
                    const obj = {
                        time: msg.eventTime,
                        type: 'SELL',
                        quantity: msg.quantity,
                        price: msg.price,
                        stt: 'FILLED',
                        eRate: (this.s*100/(this.s + this.e)).toFixed(2)
                    }
                    parentPort.postMessage(obj)                  
                }
                if(msg.orderStatus == 'CANCELED') {
                    this.updateArr(this.sIds, msg.orderId)
                    this.e++
                    const obj = {
                        time: msg.eventTime,
                        type: 'SELL',
                        quantity: Number(msg.quantity) - Number(msg.totalQuoteTradeQuantity)/Number(msg.price),
                        price: msg.price,
                        stt: 'ERROR',
                        eRate: (this.s*100/(this.s + this.e)).toFixed(2)
                    }
                    parentPort.postMessage(obj)                 
                }
            }
        })
    }

    run(){
        parentPort.on('message',async (message) => {
            const { a, p, time } = message
            if(a > 0 && p > 0) {
                console.log('sell', a, p, time)
                myQueue.add({ a, p, time })
            }
        })

        myQueue.process(1, async (job) => {
            const { a, p, time } = job.data
            console.log(a, p, time)
            if(!this.mark.has(Math.floor(time/200)*2)){
                this.mark.set(Math.floor(time/200)*2, true)
                this.a = a.fix(5)
                this.order(a.fix(5), p.toFixed(2))
            }
        })
    }
}

const sell = new Sell()

sell.run()







