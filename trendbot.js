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
        this.keep = false
        this.price = 0
        this.low = 1e10
        this.high = 0
        this.mark = new Map()
        this.worker = new Worker('./trendtrade.js')
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
            if(this.price > this.last.high && this.low > this.last.low && this.last.trend == 'up'){
                this.keep = true
                this.worker.postMessage({ type: 'CANCEL', price: this.price, last: {...this.last}})
            }
            if(this.price < this.last.low && this.high < this.last.high && this.last.trend == 'down'){
                this.keep = true
                this.worker.postMessage({ type: 'CANCEL', price: this.price, last: {...this.last}})
            }
            this.worker.postMessage({ type: 'PRICE', price: this.price, last: {...this.last}})
        })
    }

    filter(candle){
        if (this.last.high >= candle.high && this.last.low <= candle.low) {
            if(this.last.trend == 'down'){
                this.last = {...candle}
                this.last.trend = 'down';
                this.cooks.push(this.last);
                this.trades.push({type: 'BUY', price: this.price, last: {...this.last} });
                this.worker.postMessage({type: 'BUY', price: this.price, last: {...this.last} })
                console.log('inbounce down')
                this.keep = false
            }
            if(this.last.trend == 'up'){
                this.last = {...candle}
                this.last.trend = 'up';
                this.cooks.push(this.last);
                this.trades.push({type: 'SELL', price: this.price, last: {...this.last} });
                this.worker.postMessage({type: 'SELL', price: this.price, last: {...this.last} })
                console.log('inbounce up')
                this.keep = false
            }
        }
        if (this.last.high < candle.high && this.last.low > candle.low) {
    
            if (this.last) {
                if (this.last.trend == 'up') {
                    this.last = {...candle}
                    this.last.trend = this.keep? 'up': 'down'
                    this.cooks.push(this.last);
                    if(this.last.trend == 'up'){
                        console.log('outbounce up');
                        this.trades.push({type: 'SELL', price: this.price, last: {...this.last}})
                        this.worker.postMessage({type: 'SELL', price: this.price, last: {...this.last} })
                    } else {
                        console.log('outbounce down');
                        this.trades.push({type: 'BUY', price: this.price, last: {...this.last} });
                        this.worker.postMessage({type: 'BUY', price: this.price, last: {...this.last} })
                    }
                } else {
                    this.last = {...candle}
                    this.last.trend = this.keep? 'down': 'up'
                    this.cooks.push(this.last);
                    if(this.last.trend == 'down'){
                        console.log('outbounce down');
                        this.trades.push({type: 'BUY', price: this.price, last: {...this.last} });
                        this.worker.postMessage({type: 'BUY', price: this.price, last: {...this.last} })
                    } else {
                        console.log('outbounce up');
                        this.trades.push({type: 'SELL', price: this.price, last: {...this.last} });
                        this.worker.postMessage({type: 'SELL', price: this.price, last: {...this.last} })

                    }
                }
                this.keep = false
            } else {
                this.last = {...candle}
                this.last.trend = 'up';
                this.cooks.push(this.last)
            }
        }
    
        if (this.last.high < candle.high && this.last.low < candle.low) {
            this.last = {...candle}
            this.last.trend = 'up';
            this.cooks.push(this.last)
            this.trades.push({type: 'SELL', price: this.price, last: {...this.last} });
            this.worker.postMessage({type: 'SELL', price: this.price, last: {...this.last}})
            console.log('trend up')
            this.keep = false
        }
    
        if (this.last.high > candle.high && this.last.low > candle.low) {
            this.last = {...candle}
            this.last.trend = 'down';
            this.cooks.push(this.last);
            this.trades.push({type: 'BUY', price: this.price, last: {...this.last}})
            this.worker.postMessage({type: 'BUY', price: this.price, last: {...this.last}})
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
                    let candle = {
                        low: this.low,
                        high: this.high
                    }
                    this.low = 1e10
                    this.high = 0
                    this.filter(candle)
                    console.log(candle ,this.trades.slice(-5))
                }
                if(seconds === 58){
                    console.log('cancel time')
                    this.worker.postMessage({ type: 'CANCEL', price: this.price, last: {...this.last}})
                }
            }
        }, 1000);
    }
}

const trend = new Trend('BTC', 'FDUSD', 1)
trend.run()