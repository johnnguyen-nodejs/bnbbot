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
        this.price = 0
        this.sIds = []
        this.a  = 0
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
            console.log('S', error.message)
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
        },100)
    }

    reOrder(){
        setInterval(() => {
            if(this.a > 0.0001) {
                this.order({ a: this.a.fix(5), p: this.price.toFixed(5)})
            }
        },100)
    }


    async updateArr(arr, id) {
        const index = arr.findIndex(item => item === id);
        if (index !== -1) {
            arr.splice(index, 1);
        }
    }

    event(){
        client.ws.marginUser(msg => {
            if(msg.eventType == 'executionReport' && msg.orderType == "LIMIT_MAKER" && msg.side == 'SELL') {
                if(msg.orderStatus == 'NEW') {
                    this.a = 0
                    this.sIds.push(msg.orderId)
                }
                if(msg.orderStatus == 'FILLED' || msg.orderStatus == 'CANCELED') {
                    this.a += Number(msg.quantity) - Number(msg.totalTradeQuantity)
                    this.updateArr(this.sIds, msg.orderId)               
                }
            }
        })
    }

    run(){
        parentPort.on('message',async (message) => {
            const { a, p } = message
            this.price = p
            if(a > 0 && p > 0) {
                this.order(a.fix(5), p.toFixed(2))
            }
        })
    }
}

const sell = new Sell()

sell.run()







