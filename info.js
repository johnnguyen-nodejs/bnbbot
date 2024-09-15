import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import { setTimeout } from 'timers/promises'
import { Level } from 'level'
const db = new Level('db')
const main = async () => {
    for await (const [key, value] of db.iterator()) {
        value.time = new Date(value.time)
        console.log(value)

        // await setTimeout(200)
    }
}
main()


