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
import List from './src/interfaces/List'
import { promisify } from 'util'

const readFilePromise = promisify(readFile)

class MassBanAndClean {
    private AUTH: AuthInterface
    private arguments = process.argv.slice(SETTINGS.UNUSED_NODE_ARGS)
    private performMassBan: boolean
    private performMassUnBan: boolean
    private bannedList = `${currentDir}/${SETTINGS.BANNED_USERS_LIST}`
    private unbannedList = `${currentDir}/${SETTINGS.UNBANNED_USERS_LIST}`
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
     * 
     * @param remoteList Remote list which will be compared with local
     * @param progressFile Local file used to keep track of progress from the remote list
     * @param remoteTextSeparator Token used to separate lines from remote file
     * @returns Object containing the list on which to operate on and its length
     */
    private async getList(remoteList: string = URLS.LIST, progressFile: string = this.bannedList, remoteTextSeparator: string = SETTINGS.SEPARATOR): Promise<List> {
        console.info('Acquiring list...')

        const listResponse = await fetch(remoteList)
        
        await this.hasApiCallOkStatus(listResponse.status)

        const fetchedList = await listResponse.text()

        console.info('Local and remote lists acquired!')

        const fileBuffer = await readFilePromise(progressFile, 'utf-8')
        const listFromBuffer = fileBuffer.split(SETTINGS.SEPARATOR)
        const fetchedListFromRemoteBuffer = fetchedList.split(remoteTextSeparator)
        const list = this.sanitizeArray(difference(fetchedListFromRemoteBuffer, listFromBuffer))

        return {
            list,
            length: list.length
        }
    
    }

    /**
     * Bans users given a fetched list of known users, and filters out the already banned users from a txt file.
     * Disconnects if the ban command isn't sent.
     */
    private async banFromList(): Promise<void> {
        const {list, length} = await this.getList()

        console.info(`Banning ${length} users...`)

        for (const name of list) {
            await this.sleep(SETTINGS.TIMEOUT_BUFFER)
            await this.client.say(this.AUTH.CHANNEL, `/ban ${name} Known bot`)
            .then(() => appendFileSync(this.bannedList, `${SETTINGS.SEPARATOR}${name}`, 'utf8'))
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
        const {list: toUnban, length: toUnbanLength} = await this.getList(URLS.LIST_FALSE_POSITIVES, this.unbannedList, SETTINGS.SEPARATOR_UNBANNED_REMOTE)

        console.info(`Unbanning ${toUnbanLength} users...`)

        for (const name of toUnban) {
            await this.sleep(SETTINGS.TIMEOUT_BUFFER)
            await this.client.say(this.AUTH.CHANNEL, `/unban ${name}`)
            .then(() => appendFileSync(this.unbannedList, `${SETTINGS.SEPARATOR}${name}`, 'utf8'))
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
            if (!existsSync(this.bannedList)) {
                this.client.disconnect()
                throw new Error(`${this.bannedList} does not exist!`)
            }

            await this.banFromList()
        }

        if (this.performMassUnBan) {
            if (!existsSync(this.unbannedList)) {
                this.client.disconnect()
                throw new Error(`${this.unbannedList} does not exist!`)
            }

            await this.unBanFalsePositives()
        }

        this.client.disconnect()
    }
}

new MassBanAndClean().init()
