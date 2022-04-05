const path = require('path');
const fs = require('fs');
// const json = require('json5');
const IRC = require('irc-framework');
const mysql = require('mysql2');
// const settings = require('./conf/settings.json');
// const db = require('conf/db.json');

const Channel = require('./lib/channel');

const debugRaw = false;
const debugEvents = false;

const database = './conf/db.json';
const dbdata = fs.readFileSync(database);
const dbConf = JSON.parse(dbdata);
const dbCon = mysql.createPool(dbConf);

const filename = './conf/config.json';
const rawdata = fs.readFileSync(filename);
const config = JSON.parse(rawdata);

// Catch uncaught exceptions so the bot does not crash
process.on('uncaughtException', function (err) {
    console.error(err.stack);
});

const bot = new IRC.Client();
// Use debugging middleware
bot.use(ircMiddleware());

const channels = Object.create(null);

dbCon.query(`
    SELECT 
        m.id as mbID, 
        m.name as name, 
        r.name as radioname, 
        r.description as motd, 
        r.source as source, 
        r.icestats as icestats, 
        r.logo as logo, 
        r.website as website, 
        r.twitch as twitch, 
        r.nowplay as nowplay, 
        r.announce as announce, 
        r.timer as timer, 
        r.dj as dj, 
        r.requests as requests, 
        y.enabled as youtube, 
        c.enabled as mixcloud 
    FROM magirc_mediabot_main AS m 
    LEFT JOIN magirc_mediabot_radio AS r 
        ON m.id = r.id LEFT JOIN magirc_mediabot_youtube as y 
        ON m.id = y.id LEFT JOIN magirc_mediabot_mixcloud as c 
        ON m.id = c.id`,
(error, results, fields) => {
    if (error) throw error;
    for (const row of results) {
        const chan = new Channel(bot, row.name);
        channels[chan.name.toLowerCase()] = chan;
        Object.assign(chan, row);
    }
},
);

bot.findAccount = (accountName) => {
    for (const channel of Object.values(bot.channels)) {
        for (const user of channel.users) {
            if (user.account && bot.caseCompare(user.account, accountName)) {
                return user;
            }
        }
    }
};

// Overload bot.raw to intercept outgoing messages
const originalRaw = bot.raw;
bot.raw = function raw(...args) {
    let message = null;

    if (args[0] instanceof IRC.Message) {
        message = args[0];
    } else {
        const rawString = bot.rawString(...args);
        message = IRC.ircLineParser(rawString);
    }

    const line = message.to1459();
    if (debugRaw) {
        console.log('[<-]', line);
    }

    originalRaw.apply(bot, [message]);
};

// Load modules
const modules = Object.create(null);
bot.modules = modules;
const modulesDir = path.join(__dirname, 'modules');
const moduleFiles = fs.readdirSync(modulesDir).filter((f) => /.js$/.test(f));
for (const file of moduleFiles) {
    try {
        const Module = require(path.join(modulesDir, file));
        modules[file] = new Module(bot, config, channels, dbCon);
    } catch (err) {
        console.error(`Failed to load module [${file}]:`, err.message);
    }
}

bot.connect(config.client);

bot.on('registered', function () {
    bot.raw(`oper ${config.client.oper.name} ${config.client.oper.password}`);

    // add botcentral channel to the channels object with all modules disabled
    const chan = new Channel(bot, config.botcentral);
    channels[chan.name.toLowerCase()] = chan;
    const obj = { mbID: 0, radioname: '', motd: '', source: '', icestats: '', logo: '', website: '', twitch: '', nowplay: 0, announce: 0, timer: 0, requests: 0, youtube: 0, mixcloud: 0 };
    Object.assign(chan, obj);

    // join botcentral and subscribed channels
    for (const channel of Object.values(channels)) {
        channel.join();
    }
});

bot.on('message', (event) => {
    const line = event.message.trim();
    if (!line) {
        return;
    }

    event.replyTarget = (event.target === bot.user.nick) ? event.nick : event.target;
    const words = line.split(' ');
    const lcNick = bot.user.nick.toLowerCase();
    const lcFirstWord = words[0].toLowerCase();
    let isCommand = false;

    if (event.target === bot.user.nick) {
        isCommand = true;
    }

    if (lcFirstWord === lcNick) {
        // First word the bots nick
        isCommand = true;
        words.shift();
    } else if (words[0][0] === config.prefix) {
        // Prefix exists
        isCommand = true;
        words[0] = words[0].slice(1);
    } else if (lcFirstWord.includes(lcNick)) {
        const escapedNick = escapeRegex(lcNick);
        const regexp = new RegExp(`^${escapedNick}[,.;:]$`);
        if (regexp.test(lcFirstWord)) {
            // First word is the bots nick with punctuation
            isCommand = true;
            words.shift();
        }
    }

    if (!isCommand) {
        return;
    }

    // Using irc-framework event and event bus like this is generally not a good idea
    // due to the possibility of collisions with existing events properties and event names
    event.botCommand = words.shift().toLowerCase();
    event.botParams = words.filter((f) => !!f.trim());
    bot.emit('bot.command', event);
    bot.emit('bot.command.' + event.botCommand, event);
});

function escapeRegex(string) {
    return string.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function ircMiddleware() {
    return function (client, rawEvents, parsedEvents) {
        rawEvents.use(rawMiddleware);
        parsedEvents.use(parsedMiddleware);
    };

    function rawMiddleware(command, event, rawLine, client, next) {
        if (debugRaw) {
            console.info('[->]', rawLine.trim());
        }

        next();
    }

    function parsedMiddleware(command, event, client, next) {
        if (debugEvents) {
            console.info('[--]', command, event);
        }
        next();
    }
}
