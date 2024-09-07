import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEY1,
    apiSecret: process.env.BINANCE_API_SECRET1
})
console.log(await client.ping())
const symbol = process.env.SYMBOL || 'BTCFDUSD'
let btcAmount = 0
let usdAmount = 0
let btcLocked = 0
let usdLocked = 0

const getBalance = async () => {
    try {
        const accountInfo = await client.accountInfo();
        usdAmount = parseFloat(accountInfo.balances.find(asset => asset.asset === 'FDUSD').free);
        usdLocked = parseFloat(accountInfo.balances.find(asset => asset.asset === 'FDUSD').locked)
        btcAmount = parseFloat(accountInfo.balances.find(asset => asset.asset === 'BTC').free)
        btcLocked = parseFloat(accountInfo.balances.find(asset => asset.asset === 'BTC').locked)
        return
    } catch (error) {
        throw new Error(error)
    }
};

const placeLimitOrder = async (symbol, side, quantity, price) => {
    try {
        const order = await client.order({
            symbol,
            side,
            type: 'LIMIT_MAKER',
            quantity,
            price
        });
        // console.log(side, order.transactTime)
        return order;
    } catch (error) {
        console.log('-')
        console.log(side, error.message)
    }
};

const handle = new Map()
const main = async () => {
    try {
        let start = 0
        await getBalance()
        let buyPrice = 0
        client.ws.trades([symbol], async trade => {
            try {
                
                if( parseFloat(trade.price) + 2 < start && usdAmount > 5) {
                    console.log(usdAmount, usdLocked, btcAmount, btcLocked,(usdAmount + usdLocked + (btcAmount + btcLocked)*parseFloat(trade.price)))
                    placeLimitOrder(symbol, 'BUY', ((usdAmount + usdLocked + (btcAmount + btcLocked)*parseFloat(trade.price))*0.035/(parseFloat(trade.price) + 0.001)).fix(5), (parseFloat(trade.price) + 0.001).fix(2))
                    buyPrice = parseFloat(trade.price)
                }
                if(parseFloat(trade.price) > start + 2 && btcAmount >= 0.00001) {
                    if(parseFloat(trade.price) > buyPrice){
                        console.log(btcAmount, parseFloat(trade.price) - buyPrice)
                        placeLimitOrder(symbol, 'SELL', btcAmount.fix(5),(parseFloat(trade.price) - 0.001).fix(2))
                    }
                }
                start = parseFloat(trade.price)
            } catch (error) {
                throw new Error(error)
            }
        })
        setInterval(async () => {
            try {
                const orders = await client.openOrders({symbol})
                if(orders.length > 0){
                    for(const order of orders) {
                        if(order.side == 'BUY') {
                            await client.cancelOrder({
                                symbol,
                                orderId: order.orderId
                            })

                        }
                    }
                    
                }
            } catch (error) {
                console.log('--')
            }
        }, 200)
        
    } catch (error) {
        main()
    }
    
}
client.ws.user(msg => {
    if(msg.eventType == 'outboundAccountPosition') {
        btcAmount = parseFloat(msg.balances[0].free)
        usdAmount = parseFloat(msg.balances[2].free)
        btcLocked = parseFloat(msg.balances[0].locked)
        usdLocked = parseFloat(msg.balances[2].locked)
    }
})


main()
