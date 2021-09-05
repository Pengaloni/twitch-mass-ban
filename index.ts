import * as dotenv from 'dotenv'
const currentDir = __dirname

dotenv.config({
    path: `${currentDir}/.env`
})

import tmi, {Actions, Options} from 'tmi.js'
import fetch from 'node-fetch'
import difference from 'lodash.difference'
import { appendFileSync, existsSync, readFile } from 'fs'
import SETTINGS from './src/shared/settings'
import URLS from './src/shared/urls'
import Arguments from './src/enums/Arguments'
import AuthInterface from './src/interfaces/AuthInterface'
import { promisify } from 'util'

const readFilePromise = promisify(readFile)

class MassBanAndClean {
    private AUTH: AuthInterface
    private arguments = process.argv.slice(SETTINGS.UNUSED_NODE_ARGS)
    private performMassBan: boolean
    private performMassUnBan: boolean
    private bannedList = `${currentDir}/${SETTINGS.BANNED_USERS_LIST}`

    // define tmi.js object until the vendor provides types.
    private client: Actions

    constructor() {
        this.performMassBan = this.isFlagTrue(this.arguments[Arguments.ENABLE_MASS_BAN])
        this.performMassUnBan = this.isFlagTrue(this.arguments[Arguments.ENABLE_MASS_UNBAN])

        this.AUTH = {
            OAUTH_TOKEN: process.env.OAUTH_TOKEN,
            USERNAME: process.env.USERNAME,
            CHANNEL: process.env.CHANNEL,
        }

        const tmiClientOptions: Options = {
            options: { debug: true },
            identity: {
                username: this.AUTH.USERNAME,
                password: this.AUTH.OAUTH_TOKEN,
            },
            channels: [this.AUTH.CHANNEL],
            connection: {
                reconnect: false,
            },
        }

        this.client = new tmi.Client(tmiClientOptions)
    }

    /**
     * Disconnect from client and throw an error if the call does not have a 2xx status.
     * @param status The status of the call.
     */
    private async hasApiCallOkStatus(status: number): Promise<void> {
        const HTTP_OK_REGEX = '20[01]'
        const OK_RESPONSE_STATUS_REGEX = new RegExp(HTTP_OK_REGEX)

        if (!OK_RESPONSE_STATUS_REGEX.test(status.toString())) {
            this.client.disconnect()
            throw new Error(`Endpoint responded with status: ${status}`)
        }
    }

    /**
     * Checks if the CLI argument exists or if it is true.
     * @param arg A command line argument.
     * @returns If argument is undefined, return default status Settings, otherwise check if it is equal to 'true'.
     */
    private isFlagTrue(arg: string): boolean {
        if (this.isUndefined(arg)) {
            return SETTINGS.DEFAULT_ARG_FLAG
        }

        return arg.toLowerCase() === 'true'
    }

    /**
     * 
     * @param variable Any variable that needs to be checked of its undefined status.
     * @returns If the variable given is undefined.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isUndefined(variable: any): boolean {
        return typeof variable === 'undefined'
    }

    /**
     * Checks if the credential exists and has a length
     * @param credential A credential from .env file
     * @returns If the credential exists and has a length
     */
    private isCredentialInvalid(credential: string | undefined): boolean {
        return this.isUndefined(credential) || !credential.length
    }

    /**
     * 
     * @param arr Array of strings.
     * @returns Array of string with removed duplicates and no empty elements.
     */
    private sanitizeArray(arr: string[]): string[] {
        const removedEmptyItems = arr.filter(e => e)
        const uniqueValues = [...new Set(removedEmptyItems)]
        return uniqueValues
    }

    /**
     * @param time Milliseconds to wait.
     * @returns A promise after given time.
     */
    private sleep(time: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, time))
    }

    /**
     * Bans users given a fetched list of known users, and filters out the already banned users from a txt file.
     * Disconnects if the ban command isn't sent.
     */
    private async banFromList(): Promise<void> {
        console.info('Acquiring list...')

        const listResponse = await fetch(URLS.LIST)
        
        await this.hasApiCallOkStatus(listResponse.status)

        const fetchedList = await listResponse.text()

        console.info('Ban list acquired!')

        const bannedBuffer = await readFilePromise(this.bannedList, 'utf-8')
        const banned = bannedBuffer.split(SETTINGS.SEPARATOR)
        const fetched = fetchedList.split(SETTINGS.SEPARATOR)
        const toBan = this.sanitizeArray(difference(fetched, banned))
        const toBanLength = toBan.length

        console.info(`Banning ${toBanLength} users...`)

        for (const name of toBan) {
            await this.sleep(SETTINGS.TIMEOUT_BUFFER)
            await this.client.say(this.AUTH.CHANNEL, `/ban ${name} Known bot`).then(() => {
                appendFileSync(this.bannedList, `${SETTINGS.SEPARATOR}${name}`, 'utf8')
            })
            .catch(e => {
                this.client.disconnect()
                throw new Error(e)
            })
        }
    }

    /**
     * Removes ban status given a list.
     * Disconnects if the unban command isn't sent.
     */
    private async unBanFalsePositives(): Promise<void> {
        console.info('Acquiring false positives list...')

        const listResponse = await fetch(URLS.LIST_FALSE_POSITIVES)

        await this.hasApiCallOkStatus(listResponse.status)

        const fetchedList = await listResponse.text()

        console.info('List of false positives acquired!')
        
        const unBanList = this.sanitizeArray(fetchedList.split('\n'))
        const unBanListLength = unBanList.length

        console.info(`Unbanning ${unBanListLength} users...`)

        for (const name of unBanList) {
            await this.sleep(SETTINGS.TIMEOUT_BUFFER)
            await this.client.say(this.AUTH.CHANNEL, `/unban ${name}`)
            .catch(e => {
                this.client.disconnect()
                throw new Error(e)
            })
        }
    }

    /**
     * Checks if the client connected correctly, if the credentials file exists and is correct,
     * performs a mass ban and a mass unban given the appropriate lists.
     * Disconnects if connection problems occur or if the mass ban/unban encountered problems.
     */
    public async init(): Promise<void> {
        // if could not connect
        if (this.isUndefined(this.client)) {
            throw new Error('Error while connecting!')
        }

        // if .env file does not exist, exit
        if (!existsSync(`${currentDir}/.env`)) {
            throw new Error(`No .env file found in ${currentDir}`)
        }

        // if credentials are empty, exit
        if (this.isCredentialInvalid(this.AUTH.OAUTH_TOKEN) || this.isCredentialInvalid(this.AUTH.USERNAME) || this.isCredentialInvalid(this.AUTH.CHANNEL)) {
            throw new Error('Invalid credentials in .env file!')
        }

        console.info('Connecting to Twitch...')
        console.info(`Connecting to #${this.AUTH.CHANNEL} with user ${this.AUTH.USERNAME}`)

        try {
            await this.client.connect()
        }
        catch {
            throw new Error('You got rate limited!')
        }

        console.info('Connected!')

        if (this.performMassBan) {
            await this.banFromList()
        }

        if (this.performMassUnBan) {
            await this.unBanFalsePositives()
        }

        this.client.disconnect()
    }

}

new MassBanAndClean().init()
