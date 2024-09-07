import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { Bot } from "grammy"
import { Worker } from 'worker_threads'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
console.log(await client.ping())
const symbol = process.env.SYMBOL || 'BTCFDUSD'
const token = '6199209865:AAGfm7HNh_BErEfy-NRrCIDDca8xdG5w1I0'
const sWorker = new Worker('./sF.js')
const bot = new Bot(token);
let btcAmount = 0
let usdAmount = 0
let btcLocked = 0
let usdLocked = 0
let canBuy = true
let rate = 0.02
let stop = false
let sstop = false
const bIds = []

const getBalance = async () => {
    try {
        const accountInfo = await client.marginAccountInfo();
        usdAmount = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD')?.free);
        usdLocked = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD')?.locked)
        btcAmount = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC')?.free)
        btcLocked = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC')?.locked)
        return
    } catch (error) {
        throw new Error(error)
    }
};

const order = async (quantity, price) => {
    try {
        const order = await client.marginOrder({
            symbol,
            side: 'BUY',
            type: 'LIMIT_MAKER',
            quantity,
            price
        });
        return order;
    } catch (error) {
        console.log('-')
    }
};

const cancel = async (orderId) => {
    try {
        await client.marginCancelOrder({
            symbol,
            orderId
        })
    } catch (error) {
        console.log('-')
    }
}

const updateArr = (id) => {
    const index = bIds.findIndex(item => item.i === id);
    
    if (index !== -1) {
        bIds.splice(index, 1);
    }
}
const handle = new Map()
let max = 0
let min = 0
let start = 0
const main = async () => {
    await getBalance()
    let k = 0
    client.ws.trades([symbol], async trade => {
        try {
            // if(Number(trade.price) > max) {
            //     max = Number(trade.price)
            //     // console.log('NEW MAX: ' + max)
            // }
            if(Number(trade.price) < min || min == 0) {
                min = Number(trade.price)
                console.log('NEW MIN: ' + min)
            }
            // console.log(min, max, trade.price)
            // if(Number(trade.price) < max - 10) {
            //     if(!stop) {
            //         stop = true
            //         console.log('LOCKED')
            //     }
            // } else {
            //     if(stop) {
            //         stop = false
            //         console.log('OPENED')
            //     }
            // }
            // if(max - min < 30 && max -min > 20 && Number(trade.price) > min + 10) {
            //     if(stop) {
            //         stop = false
            //     }
            // }
            if( Number(trade.price) + 2 < start && usdAmount > 5 && canBuy) {
                if(!handle.get(`${k+1}`) && !stop && !sstop) {
                    order(((usdAmount + usdLocked + (btcAmount + btcLocked)*Number(trade.price))*rate/(Number(trade.price) + 0.001)).fix(5), (Number(trade.price) + 0.001).fix(2))
                    k++
                }
            }
            if(Number(trade.price) > min + 30 && sstop) {
                sstop = false
                sWorker.postMessage({ a: 0, p: 0, stop: false})
            }
            if(Number(trade.price) > min + 40) {
                min += 10
                console.log('NEW MIN 1: ' + min)
            }
            start = Number(trade.price)
        } catch (error) {
            throw new Error(error)
        }
    })
    setInterval(() => {
        canBuy = true
    }, 200)

    // setInterval(() => {
    //     if(stop) {
    //         stop = false
    //         max = start
    //         console.log('NEW MAX 1: ' + max)
    //     }
    // }, 10000)

    // setInterval(() => {
    //         if(max -min > 30) {
    //             min += 10
    //             // console.log('NEW MIN 1: ' + min)
    //         }
    // }, 5000)

    bot.command("change", ctx => {
        rate = Number(ctx.match)
    })


    bot.command("open",  async ctx => {
        const a = ctx.match
        sWorker.postMessage({ a: 0, p: 0, stop: false})
        sstop = Number(a) == 1? false: true
    })
    bot.start()
}
client.ws.marginUser(msg => {
    if(msg.eventType == 'outboundAccountPosition') {
        btcAmount = Number(msg.balances[0]?.free) || 0
        usdAmount = Number(msg.balances[2]?.free) || 0
        btcLocked = Number(msg.balances[0]?.locked) || 0
        usdLocked = Number(msg.balances[2]?.locked) || 0
    }
    if(msg.eventType == 'executionReport' && msg.side == 'BUY') {
        if(msg.orderStatus == 'NEW') {
            canBuy = false
            bIds.push({
                i: msg.orderId,
                a: msg.quantity,
                p: msg.price
            })
        }
        if(msg.orderStatus == 'FILLED') {
            updateArr(msg.orderId)
            sWorker.postMessage({ a: Number(msg.lastTradeQuantity), p: Number(msg.price) + 4, stop})
        }
        if(msg.orderStatus == 'PARTIALLY_FILLED') {
            sWorker.postMessage({ a: Number(msg.lastTradeQuantity), p: Number(msg.price) + 4, stop})
        }
        if(msg.orderStatus == 'CANCELED') {
            updateArr(msg.orderId)
        }
    }
})

setInterval(async () => {
    if(bIds.length > 0){
        for(const order of bIds) {
            cancel(order.i)
        }        
    }
}, 200)

sWorker.on("message", (msg) => {
    if(msg.p > 0 && msg.p > start + 10) {
        if(!sstop) {
            sstop = true
            bot.api.sendMessage(1628930989,`STOP:\nAve: ${msg.p}\nPrice: ${start}\nAmount: ${msg.a}\nCap: ${usdAmount}`)
            min = start
        }
    } else {
        if(sstop) {
            sstop = false
            bot.api.sendMessage(1628930989,`OPEN:\nAve: ${msg.p}\nPrice: ${start}\nAmount: ${msg.a}\nCap: ${usdAmount}`)
        }
    }
})


main()

