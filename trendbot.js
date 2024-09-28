import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import cron from 'node-cron'
import { Worker } from 'worker_threads'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
console.log(await client.ping())


class Trend {
    constructor(asset, quote, time){
        this.asset = asset
        this.quote = quote
        this.cooks = []
        this.trades = []
        this.last = {
            high: 0,
            low: 0
        }
        this.time = time
        this.m = 0
        this.keep = false
        this.price = 0
        this.low = 1e10
        this.high = 0
        this.mark = new Map()
        this.worker = new Worker('./trendtrade1.js')
        this.getPrice()
    }

    getPrice(){
        client.ws.trades([this.asset + this.quote], msg => {
            this.price = parseFloat(msg.price)
            if(this.high < this.price) { 
                this.high = this.price
            }
            if(this.low > this.price){
                this.low = this.price
            }
            if(this.high > this.last.high && this.low > this.last.low && this.last.trend == 'up'){
                this.keep = true
                this.worker.postMessage({ type: 'CANCEL', price: this.price, last: {...this.last}, id: 0})
            }
            if(this.low < this.last.low && this.high < this.last.high && this.last.trend == 'down'){
                this.keep = true
                this.worker.postMessage({ type: 'CANCEL', price: this.price, last: {...this.last}, id: 0})
            }
            if(this.low < this.last.low && this.high <= this.last.high && this.last.trend == 'up' && !this.keep && this.m ==  (new Date(msg.eventTime)).getMinutes() && !this.mark.has(Math.floor(msg.eventTime/60000)*60000) && (new Date(msg.eventTime)).getSeconds() > 2){
                this.mark.set(Math.floor(msg.eventTime/60000)*60000, true)
                setTimeout(() => {
                    this.worker.postMessage({ type: 'REVERSE', price: this.price, last: {...this.last}, id: 51})
                }, 1500);
            }
            if(this.high > this.last.high && this.low >= this.last.low && this.last.trend == 'down' && !this.keep  && this.m ==  (new Date(msg.eventTime)).getMinutes() && !this.mark.has(Math.floor(msg.eventTime/60000)*60000) && (new Date(msg.eventTime)).getSeconds() > 2){
                this.mark.set(Math.floor(msg.eventTime/60000)*60000, true)
                setTimeout(() => {
                    this.worker.postMessage({ type: 'REVERSE', price: this.price, last: {...this.last}, id: 52})
                }, 1500);
            }
            this.worker.postMessage({ type: 'PRICE', price: this.price, last: {...this.last}, id: 0})
        })
    }

    filter(candle){
        if (this.last.high >= candle.high && this.last.low <= candle.low) {
            if(this.last.trend == 'down'){
                this.last = {...candle}
                this.last.trend = 'down';
                this.cooks.push({...this.last});
                this.trades.push({type: 'BUY', price: this.price, last: {...this.last} });
                this.worker.postMessage({type: 'BUY', price: this.price, last: {...this.last}, id: 10 })
                console.log('inbounce down')
                this.keep = false
            }
            if(this.last.trend == 'up'){
                this.last = {...candle}
                this.last.trend = 'up';
                this.cooks.push({...this.last});
                this.trades.push({type: 'SELL', price: this.price, last: {...this.last} });
                this.worker.postMessage({type: 'SELL', price: this.price, last: {...this.last}, id: 10 })
                console.log('inbounce up')
                this.keep = false
            }
        }
        if (this.last.high < candle.high && this.last.low > candle.low) {
    
            if (this.last.trend == 'up') {
                this.last = {...candle}
                this.last.trend = this.keep? 'up': 'down'
                this.cooks.push({...this.last});
                if(this.last.trend == 'up'){
                    console.log('outbounce up');
                    this.trades.push({type: 'SELL', price: this.price, last: {...this.last}})
                    this.worker.postMessage({type: 'SELL', price: this.price, last: {...this.last}, id: 21 })
                } else {
                    console.log('outbounce down');
                    this.trades.push({type: 'BUY', price: this.price, last: {...this.last} });
                    this.worker.postMessage({type: 'BUY', price: this.price, last: {...this.last}, id: 22 })
                }
            } else {
                this.last = {...candle}
                this.last.trend = this.keep? 'down': 'up'
                this.cooks.push({...this.last});
                if(this.last.trend == 'down'){
                    console.log('outbounce down');
                    this.trades.push({type: 'BUY', price: this.price, last: {...this.last} });
                    this.worker.postMessage({type: 'BUY', price: this.price, last: {...this.last}, id: 23 })
                } else {
                    console.log('outbounce up');
                    this.trades.push({type: 'SELL', price: this.price, last: {...this.last} });
                    this.worker.postMessage({type: 'SELL', price: this.price, last: {...this.last}, id: 24 })

                }
            }
            this.keep = false
        }
    
        if (this.last.high < candle.high && this.last.low <= candle.low) {
            this.last = {...candle}
            this.last.trend = 'up';
            this.cooks.push({...this.last})
            this.trades.push({type: 'SELL', price: this.price, last: {...this.last} });
            this.worker.postMessage({type: 'SELL', price: this.price, last: {...this.last}, id: 30})
            console.log('trend up')
            this.keep = false
        }
    
        if (this.last.high >= candle.high && this.last.low > candle.low) {
            this.last = {...candle}
            this.last.trend = 'down';
            this.cooks.push({...this.last});
            this.trades.push({type: 'BUY', price: this.price, last: {...this.last}})
            this.worker.postMessage({type: 'BUY', price: this.price, last: {...this.last}, id: 31})
            console.log('trend down')
            this.keep = false
        }
    }
    run(){
        console.log('start cron job')
        setInterval(() => {
            const now = new Date()
            const minutes = now.getMinutes()
            const seconds = now.getSeconds()
            if(minutes%this.time === 0) {
                if(seconds === 0){
                    this.m = minutes
                    let candle = {
                        low: this.low,
                        high: this.high
                    }
                    this.low = 1e10
                    this.high = 0
                    console.log('-------------')
                    this.worker.postMessage({ type: 'CANCEL', price: this.price, last: {...this.last}, id: 1})
                    this.filter(candle)
                    console.log(candle ,this.trades.slice(-5))
                }
                if(seconds === 30){
                    this.worker.postMessage({ type: 'UPDATE', price: this.price, last: {...this.last}, id: 0})
                }
            }
        }, 1000);
    }
}

const trend = new Trend('BTC', 'FDUSD', 1)
trend.run()