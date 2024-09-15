import { Level } from "level";

export const db = new Level('all', { valueEncoding: 'json'})
export const capDb = db.sublevel('cap', { valueEncoding: 'json'})
export const priceDb = db.sublevel('price', { valueEncoding: 'json'})
export const flashDb = db.sublevel('flash', { valueEncoding: 'json'})
export const balanceDb = db.sublevel('balance', { valueEncoding: 'json'})
export const tradeDb = db.sublevel('trade', { valueEncoding: 'json'})
export const balanceSttDb = db.sublevel('balanceStt', { valueEncoding: 'json'})