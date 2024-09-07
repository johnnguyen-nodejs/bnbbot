import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { MessageChannel, Worker } from 'worker_threads'
import { redis } from './lib.js'
import { Bot } from 'grammy'
import fs from 'fs'
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
console.log(await client.ping())
const symbol = process.env.SYMBOL || 'BTCFDUSD'


// main()
class Trade {
    constructor(cap, symbol, ePrice) {
        this.symbol = symbol
        this.start = 0
        this.buy = true
        this.pending = false
        this.insufficient = false
        this.mark = new Map()
        this.btcA = 0
        this.usdA = 0
        this.btcL = 0
        this.usdL = 0
        this.usd = cap
        this.vusd = 0
        this.btc = 0
        this.vbtc = 0
        this.ousd = 0
        this.f = 'cap.txt'
        this.f1 = 'profit.txt'
        this.f2 = 'all.txt'
        this.ePrice = ePrice
        this.bWorker = new Worker('./workerB.js')
        this.sWorker = new Worker('./workerS.js')
        this.cWorker = new Worker('./workerC.js')
        // this.bot()
        this.balance()
        this.event()
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
        this.usd = Number(await redis.get('cap')) || 6
        const accountInfo = await client.marginAccountInfo();
        this.vusd = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD').free)
        this.vbtc = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC').free)
        this.btcA = this.vbtc
        this.usdA = this.vusd
        const now = new Date()
        fs.appendFile(this.f, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()}: VUSD-${this.vusd} VBTC-${this.vbtc}\n`, console.log)
    }

    updateBalance() {
        client.ws.marginUser(msg => {
            if(msg.eventType == 'outboundAccountPosition') {
                this.btcA = parseFloat(msg.balances[0].free)
                this.usdA = parseFloat(msg.balances[2].free)
                this.btcL = parseFloat(msg.balances[0].locked)
                this.usdL = parseFloat(msg.balances[2].locked)
                const now = new Date()
                fs.appendFile(this.f2, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()}: ALL-${this.usdA + this.usdL +(this.btcA + this.btcL)*this.start} PRICE-${this.start}\n`, console.log)
            }
        })
    }

    event(){
        this.sWorker.on("message", msg => {
            const { usdFilled, btcFilled } = msg
            this.vusd -= usdFilled
            this.vbtc += btcFilled
            const now = new Date()
            fs.appendFile(this.f, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()}: VUSD-${this.vusd} VBTC-${this.vbtc}\n`, console.log)
            console.log('virtual0', this.vbtc, this.vusd)
            if(this.vusd*3 < this.vbtc*this.start) {
                this.insufficient = true
                this.cWorker.postMessage({ type: 'SELL', a: this.btcA - (this.btcA + this.usdA/this.start) / 2, p: this.start})
            }
            if(this.vusd > this.vbtc*this.start*3){
                this.insufficient = true
                this.cWorker.postMessage({ type: 'BUY', a: this.usdA/this.start - (this.btcA + this.usdA/this.start) / 2, p: this.start})
            }
        })
        this.bWorker.on("message", msg => {
            const { filled, usdFilled } = msg
            this.vbtc -= filled
            this.vusd += usdFilled
            console.log('virtual1', this.vbtc, this.vusd)
            const now = new Date()
            fs.appendFile(this.f, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()}: VUSD-${this.vusd} VBTC-${this.vbtc}\n`, console.log)
            if(this.vusd*3 < this.vbtc*this.start) {
                this.insufficient = true
                this.cWorker.postMessage({ type: 'SELL', a: this.btcA - (this.btcA + this.usdA/this.start) / 2, p: this.start})
            }
            if(this.vusd > this.vbtc*this.start*3){
                this.insufficient = true
                this.cWorker.postMessage({ type: 'BUY', a: this.usdA/this.start - (this.btcA + this.usdA/this.start) / 2, p: this.start})
            }
        })
        this.cWorker.on("message", msg => {
            const { insufficient } = msg
            this.insufficient = insufficient
            this.vbtc = this.btcA
            this.vusd = this.usdA
            const now = new Date()
            fs.appendFile(this.f, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()}: VUSD-${this.vusd} VBTC-${this.vbtc}\n`, console.log)
        })
    }
    run(){
        client.ws.trades([symbol], async trade => {
            const p = parseFloat(trade.price)
            if(p + 2 < this.start) {
                if(this.buy) {
                    this.buy = false
                    this.btc = (this.usd/p).fix(5)
                    this.ousd = this.usd
                    this.usd -= this.btc*p
                    redis.set('cap', this.usd + this.btc*p)
                    console.log('--BUY--', this.usd + this.btc*p, this.btc*p, this.btc, p)
                    this.bWorker.postMessage({ p: p - 0.01, a: this.btc, time: trade.eventTime })
                }

            }
            if(p > this.start + 2) {
                if(!this.buy) {
                    this.buy = true
                    this.usd += p*this.btc
                    console.log('--SELL--', this.usd, this.btc*p, this.btc, p)
                    this.sWorker.postMessage({ a: this.btc, p: p + 0.01, time: trade.eventTime})
                    const now = new Date()
                    fs.appendFile(this.f1, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()}: new-${this.usd} old-${this.ousd} profit: ${this.usd - this.ousd}\n`, console.log)
                    this.btc = 0
                }
            }

            this.start = p
            this.bWorker.postMessage({ a: 0, p, time: 0 })
            this.cWorker.postMessage({type: 'price', a: 0, p })
        })
    }


}

const trade = new Trade(6, symbol)

trade.run()
