import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { Worker } from 'worker_threads'
import { redis } from './lib.js'
import { balanceDb, balanceSttDb, capDb, flashDb, priceDb, tradeDb } from './db.js'
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
console.log(await client.ping())
const symbol = process.env.SYMBOL || 'BTCFDUSD'


// main()
class Trade {
    constructor(cap, symbol) {
        this.capDb = capDb
        this.flashDb = flashDb
        this.balanceDb = balanceDb
        this.priceDb = priceDb
        this.tradeDb = tradeDb
        this.balanceSttDb = balanceSttDb
        this.symbol = symbol
        this.start = 0
        this.buy = true
        this.mark = new Map()
        this.btcA = 0
        this.usdA = 0
        this.btcL = 0
        this.usdL = 0
        this.usd = cap
        this.btc = 0
        this.bWorker = new Worker('./workerB.js')
        this.sWorker = new Worker('./workerS.js')
        this.cWorker = new Worker('./workerC.js')
        // this.bot()
        this.balance()
        this.updateBalance()
    }

    // bot() {
    //     const bot = new Bot('7345814940:AAHz42cPP5LtBUFlRjp1hRnBuGyGheB7yOc')
    //     bot.command('cap', ctx => {
    //         const cap = Number(ctx.match)
    //         this.usd = cap
    //         redis.set('cap') = cap
    //         ctx.reply(`Your current cap is ${this.usd}`)
    //     })

    //     bot.start()
    // }

    async balance() {

        // this.usd = Number(await redis.get('cap')) || 6
        const accountInfo = await client.marginAccountInfo();
        this.usdA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD').free)
        this.btcA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC').free)
        this.usdL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD').locked)
        this.btcL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC').locked)
    }

    updateBalance() {
        client.ws.marginUser(msg => {
            if(msg.eventType == 'outboundAccountPosition') {
                this.btcA = parseFloat(msg.balances[0].free)
                this.usdA = parseFloat(msg.balances[2].free)
                this.btcL = parseFloat(msg.balances[0].locked)
                this.usdL = parseFloat(msg.balances[2].locked)
                if((this.usdL + this.usdA)*4 < this.usdA + this.usdL + (this.btcA + this.btcL)* this.start) {
                    this.cWorker.postMessage({ type: 'SELL', a: (this.btcA + this.usdA/this.start) / 4, p: this.start, f: this.btc, time: msg.eventTime})
                    const o = {
                        time: msg.eventTime,
                        type: 'SELL',
                        amount: ((this.btcA + this.usdA/this.start)/4).fix(5),
                        price: this.start
                    }
                    this.balanceDb.put(msg.eventTime, o)
                }
                if((this.btcA + this.btcL)*this.start*4 < this.usdA + this.usdL + (this.btcA + this.btcL)*this.start){
                    this.cWorker.postMessage({ type: 'BUY', a: (this.btcA + this.usdA/this.start) / 4, p: this.start, f: this.btc, time: msg.eventTime})
                    const o = {
                        time: msg.eventTime,
                        type: 'BUY',
                        amount: ((this.btcA + this.usdA/this.start)/4).fix(5),
                        price: this.start
                    }
                    this.balanceDb.put(msg.eventTime, o)
                }
                const obj = {
                    time: msg.eventTime,
                    total: this.usdA + this.usdL + (this.btcA + this.btcL)*this.start,
                    btc: this.btcA + this.btcL,
                    usd: this.usdA + this.usdL,
                    price: this.start
                }
                this.capDb.put(msg.eventTime, obj)
            }
        })
    }

    event(){
        this.bWorker.on('mesasge', (msg) => {
            this.tradeDb.put(msg.time,msg)
        })
        this.sWorker.on('mesasge', (msg) => {
            this.tradeDb.put(msg.time, msg)
        })
        this.sWorker.on('mesasge', (msg) => {
            this.balanceSttDb.put(msg.time, msg)
        })
    }
    run(){
        client.ws.trades([symbol], async trade => {
            const p = parseFloat(trade.price)
            if(p + 2 < this.start) {
                if(this.buy) {
                    this.buy = false
                    this.btc = (this.usd/p).fix(5)
                    this.usd -= this.btc*p
                    redis.set('cap', this.usd + this.btc*p)
                    console.log('--BUY--', this.usd + this.btc*p, this.btc*p, this.btc, p)
                    this.bWorker.postMessage({ p: p - 0.01, a: this.btc, time: trade.eventTime })
                    const obj = {
                        time: trade.eventTime,
                        type: 'BUY',
                        amount: this.btc,
                        price: p,
                        btc: 0,
                        usd: this.usd + this.btc*p
                    }
                    this.flashDb.put(trade.eventTime, obj)
                }

            }
            if(p > this.start + 2) {
                if(!this.buy) {
                    this.buy = true
                    this.usd += p*this.btc
                    console.log('--SELL--', this.usd, this.btc*p, this.btc, p)
                    this.sWorker.postMessage({ a: this.btc, p: p + 0.01, time: trade.eventTime})
                    const obj = {
                        time: trade.eventTime,
                        type: 'SELL',
                        amount: this.btc,
                        price: p,
                        btc: this.btc,
                        usd: this.usd - this.btc*p
                    }
                    this.flashDb.put(trade.eventTime, obj)
                }
            }

            this.start = p
            this.cWorker.postMessage({type: 'price', a: 0, p, f: this.btc })
            this.priceDb.put(trade.eventTime, p)
        })
    }


}

const trade = new Trade(12, symbol)
trade.run()


