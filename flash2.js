import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { Bot } from "grammy";

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEY1,
    apiSecret: process.env.BINANCE_API_SECRET1
})
console.log(await client.ping())
const symbol = process.env.SYMBOL || 'BTCFDUSD'
const token = '6199209865:AAGfm7HNh_BErEfy-NRrCIDDca8xdG5w1I0'
const bot = new Bot(token);
let btcAmount = 0
let usdAmount = 0
let btcLocked = 0
let usdLocked = 0
let canBuy = true
let lock = 0
let cap = 0
let rate = 0.02
let limit = 3
let canc = 2
let stop = false
let count = 0
bot.command("change", ctx => {
    const [mn, mx] = ctx.match.split('-')
    rate = parseFloat(mn)
    limit = parseFloat(mx)
})


bot.command("open",  async ctx => {
    console.log(ctx)
})

bot.start()

const getBalance = async () => {
    try {
        const accountInfo = await client.marginAccountInfo();
        usdAmount = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD').free);
        usdLocked = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD').locked)
        btcAmount = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC').free)
        btcLocked = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC').locked)
        return
    } catch (error) {
        throw new Error(error)
    }
};

const placeLimitOrder = async (symbol, side, quantity, price, tp) => {
    try {
        const order = await client.marginOrder({
            symbol,
            side,
            type: 'LIMIT_MAKER',
            quantity,
            price
        });
        return order;
    } catch (error) {
        if(tp =='L' && error.message == 'Account has insufficient balance for requested action.') {
            process.exit()
        }
    }
};

const cancelOrder = async (symbol, order, typ) => {
    try {
        if(typ == 'cut') {
            lock += (parseFloat(order.origQty) - parseFloat(order.executedQty))
            cap += (parseFloat(order.origQty) - parseFloat(order.executedQty))*parseFloat(order.price)
        }
        await client.marginCancelOrder({
            symbol,
            orderId: order.orderId
        })
    } catch (error) {
        if(typ == 'cut') {
            lock -= (parseFloat(order.origQty) - parseFloat(order.executedQty))
            cap -= (parseFloat(order.origQty) - parseFloat(order.executedQty))*parseFloat(order.price)
        }
    }
}

const handle = new Map()
const main = async () => {
    let start = 0
    await getBalance()
    let k = 0
    client.ws.trades([symbol], async trade => {
        try {
            if(stop) return
            if( parseFloat(trade.price) + 2 < start && usdAmount > 5 && canBuy) {
                if(!handle.get(`${k+1}`)) {
                    handle.set(`${k+1}`, (parseFloat(trade.price) + 0.001).fix(2))
                    canBuy = false
                    placeLimitOrder(symbol, 'BUY', ((usdAmount + usdLocked + (btcAmount + btcLocked)*parseFloat(trade.price))*rate/(parseFloat(trade.price) + 0.001)).fix(5), (parseFloat(trade.price) + 0.001).fix(2), 'B')
                    k++
                }
            }
            if(btcAmount >= 0.0001) {
                if(stop) return
                placeLimitOrder(symbol, 'SELL', (btcAmount - lock).fix(5),(parseFloat(handle.get(k) || trade.price) + 4 + 0.001).fix(2), 'S')
            }
            start = parseFloat(trade.price)
        } catch (error) {
            throw new Error(error)
        }
    })
    setInterval(async () => {
        try {
            const orders = await client.marginOpenOrders({symbol})
            if(orders.length > 0){
                const buys = orders.filter(o => o.side == 'BUY')
                for(const order of buys) {
                    if(order.side == 'BUY') {
                        cancelOrder(symbol, order, 'buy')
                    }
                }
                
                
            }
        } catch (error) {
            console.log('--')
        }
    }, 200)
    setInterval(async () => {
        try {
            const orders = await client.marginOpenOrders({symbol})
            if(orders.length > 0){
                const sells = (orders.filter(o => o.side == 'SELL')).sort((a,b) => parseFloat(b.price) - parseFloat(a.price))
                if(sells.length >= limit) {
                    stop = true
                    for(const order of sells.slice(0,canc)) {
                        cancelOrder(symbol, order, 'cut')
                    }
                }
                
                
            }
            if(lock > 0 && cap > 0 && btcAmount > 0.0000099) {
                const res = await placeLimitOrder(symbol, 'SELL', btcAmount.fix(5),(cap/lock).fix(2), 'L')
                if(res) {
                    lock = 0
                    cap = 0
                    stop = false
                }
            }
        } catch (error) {
            console.log('--')
        }
    }, 200)
    setInterval(async () => {
        canBuy = true
    }, 300)
}
client.ws.marginUser(msg => {
    if(msg.eventType == 'outboundAccountPosition') {
        btcAmount = parseFloat(msg.balances[0].free)
        usdAmount = parseFloat(msg.balances[2].free)
        btcLocked = parseFloat(msg.balances[0].locked)
        usdLocked = parseFloat(msg.balances[2].locked)
    } else {
        console.log(msg.e)
    }
})


main()
