import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { Bot } from "grammy";
import { Worker } from 'worker_threads'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEY1,
    apiSecret: process.env.BINANCE_API_SECRET1
})
const symbol = process.env.SYMBOL || 'BTCFDUSD'
const token = '7416160697:AAHeaQaR2roknwhGwk4w8Ji6NdNPEZcWfFc'
const bot = new Bot(token);

class Trade {
    constructor() {
        this.price = 0
        this.btcA = 0
        this.usdA = 0
        this.btcL = 0
        this.usdL = 0
        this.wait = false
        this.stop = false
        this.rate = 0.02
        this.k = 0
        this.handle = new Map()
        this.bWorker = new Worker('./iWorkerB.js')
        this.sWorker = new Worker('./iWorkerS.js')
        this.time = Date.now()
        this.update()
        this.open()
        this.stopP()
    }

    async balance () {
        try {
            const accountInfo = await client.marginAccountInfo();
            this.usdA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD').free);
            this.usdL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD').locked)
            this.btcA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC').free)
            this.btcL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC').locked)
            return
        } catch (error) {
            throw new Error(error)
        }
    }

    update() {

        client.ws.marginUser(msg => {
            if(msg.eventType == 'outboundAccountPosition') {
                this.btcA = parseFloat(msg.balances[0].free)
                this.usdA = parseFloat(msg.balances[2].free)
                this.btcL = parseFloat(msg.balances[0].locked)
                this.usdL = parseFloat(msg.balances[2].locked)
            }
        })
    }

    open() {
        setInterval(() => {
            this.wait = false
            if(this.stop && this.time + 5000 < Date.now()) {
                if(this.btcA < 0.00001) {
                    this.stop = false
                }
                console.log(this.stop)
            }
        }, 300)
    }

    stopP() {
        this.sWorker.on('message', msg => {
            const { stop } = msg
            this.stop = stop
            if(this.stop) {
                this.time = Date.now()
            }
        })
    }
    async main() {
        await this.balance()
        client.ws.trades([symbol], async trade => {
            try {
                if(this.stop) return
                if( parseFloat(trade.price) + 2 < this.price && this.usdA > 5 && !this.wait) {
                    if(!this.handle.get(`${this.k+1}`)) {
                        this.handle.set(`${this.k+1}`, (parseFloat(trade.price) + 0.001).fix(2))
                        this.wait = true
                        // push to buy worker
                        this.bWorker.postMessage({a: ((this.usdA + this.usdL + (this.btcA + this.btcL)*parseFloat(trade.price))*this.rate/(parseFloat(trade.price) + 0.001)).fix(5), p: (parseFloat(trade.price) + 0.001).fix(2)})
                        this.k++
                    }
                }
                if(this.btcA >= 0.0001 && !this.stop) {
                    this.sWorker.postMessage({a: this.btcA.fix(5), p: (parseFloat(this.handle.get(this.k) || trade.price) + 4 + 0.001).fix(2)})
                }
                this.price = parseFloat(trade.price)
            } catch (error) {
                throw new Error(error)
            }
        })
    }
}

const trade = new Trade()

trade.main()

bot.command('change', ctx => {
    const nr = ctx.match
    trade.rate = parseFloat(nr)
    ctx.reply('ok')
})
bot.command('info', async ctx => {
    console.log(ctx)
    ctx.reply(`${trade.stop} -${trade.rate}`)
})
bot.command('open', async ctx => {
    trade.stop = false
    ctx.reply('ok')
})
bot.start()
