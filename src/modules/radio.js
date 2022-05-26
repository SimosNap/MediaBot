const fetch = require('node-fetch');
const utils = require('../misc/utils.js');
const Yourls = require('node-yourls/yourls');
require('irc-colors').global();

module.exports = class radio {
    shortenURL(url, title) {
        return new Promise((resolve, reject) => {
            this.shortener.shorten(
                url,
                title,
                (error, result) => {
                    if (error) {
                        return reject(error);
                    }
                    return resolve(result);
                },
            );
        });
    }

    constructor(bot, config, channels, dbCon) {
        const yourlsUrl = config.yourls_url;
        const yourlsApi = config.yourls_api;

        this.shortener = new Yourls(yourlsUrl, yourlsApi);

        const jobs = {};
        this.jobs = jobs;

        const playjobs = {};
        this.playjobs = playjobs;

        bot.on('join', async(event) => {
            if (event.nick.toLowerCase() === bot.user.nick.toLowerCase()) {
                const chan = channels[event.channel.toLowerCase()]; if (!chan) { console.error('i expected a channel object'); return; }

                if (!chan.source) {
                    return;
                }
                const shortener = await this.shortenURL('https://media.simosnap.com/player/' + chan.mbID, 'Media Player ' + chan.radioname);

                if (chan.motd && chan.announce > 0) {
                    const timeoutID = setInterval(() => {
                        const prefix = ('Ascolta ' + chan.radioname).irc.teal.bold();
                        const suffix = ('[ https://ilnk.stream/' + shortener.url.keyword + ' ]').irc.teal();

                        const tagData = [
                            chan.radioname,
                            chan.mbID,
                        ];
                        bot.say(chan.name, `🎛 ${prefix} - ${chan.motd} ${suffix}`, { '+simosnap.org/radio_station': tagData.join(';') });
                    }, (60000 * chan.timer));
                    jobs[chan.name] = timeoutID;
                }

                if (chan.nowplay === 1) {
                    const timeoutID = setInterval(async() => {
                        const json = await fetch(chan.icestats).then((r) => r.json());
                        if (!json) {
                            return;
                        }

                        // const artist = json.icestats.source.artist;
                        // const song = json.icestats.source.song;
                        const prefix = ('Adesso su ' + chan.radioname).irc.teal.bold();
                        const suffix = ('[ https://ilnk.stream/' + shortener.url.keyword + ' ]').irc.teal();
                        
                        const source = (Array.isArray(json.icestats.source)) ? json.icestats.source[0] : json.icestats.source;

                        const artist = source.artist;
                        const song = source.artist;
                        const nowplay = source.yp_currently_playing;
                        const bitrate = source.bitrate;
                        const colorizedBitrate = (bitrate + ' Kb/s').irc.red();
                        const listeners = source.listeners;
                        const colorizedListeners = listeners.toString().irc.red();

                        const tagData = [
                            nowplay,
                            bitrate,
                            chan.radioname,
                            chan.mbID,
                            listeners,
                        ];
                        bot.say(event.channel, `🎛 ${prefix} - ${nowplay} - ${colorizedBitrate} - ${colorizedListeners} ascoltatori ${suffix}`, { '+simosnap.org/radio_stream': tagData.join(';') });
                    }, (60000 * 6));
                    playjobs[event.channel] = timeoutID;
                }
            }
        });

        bot.on('message', async(event) => {
            if (event.tags['+simosnap.org/radio_request']) {
                const msgs = event.message.split('|');
                const req = msgs[0];
                const msg = msgs[1];
                const rtags = event.tags['+simosnap.org/radio_request'].split(';');
                const mbID = rtags[0];
                const targetchan = rtags[1];
                const dj = rtags[2];
                const ts = Math.round((new Date()).getTime() / 1000);

                bot.notice(dj, '* Hai ricevuto una richiesta da ' + event.nick);
                bot.notice(dj, '* Richiesta: ' + req);
                bot.notice(dj, '* Messaggio: ' + msg);

                dbCon.query('INSERT INTO magirc_mediabot_radio_requests (rid, nick, account, request, message, channel, ts) values  (?, ?, ?, ?, ?, ?, ?)', [mbID, event.nick, event.tags.account, req, msg, targetchan, ts], function (error, results, fields) {
                    if (error) throw error;
                });
            }
        });

        bot.on('bot.command.radio', async(event) => {
            const chan = channels[event.replyTarget.toLowerCase()]; if (!chan) { console.error('i expected a channel object'); return; }

            if (!chan.source) {
                bot.say(event.replyTarget, 'Il modulo radio non è abilitato per questo canale');
                return;
            }

            const isOwner = chan.getUser(event.nick).modes.includes('q');

            if (!event.account) {
                bot.say(event.replyTarget, 'Autenticati ad un account per usare il bot');
                return;
            }

            if (!chan.radioname || chan.radioname === '') {
                bot.say(event.replyTarget, 'Non hai configurato nessuna stazione radio per il canale ' + event.replyTarget + '. Per configurare una stazione radio usa il pannello account https://www.simosnap.org/account');
                return;
            }

            const shortener = await this.shortenURL('https://media.simosnap.com/player/' + chan.mbID, 'Media Player ' + chan.radioname);

            switch (event.botParams[0]) {
            case '+dj': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }

                if (!event.botParams[1]) {
                    bot.notice(event.nick, 'Devi specificare il nickname del Dj');
                    return;
                }

                if (!chan.getUser(event.botParams[1])) {
                    bot.notice(event.nick, 'Il Dj deve essere un nickname online e presente nel canale');
                    return;
                }

                dbCon.query('UPDATE magirc_mediabot_radio SET dj = ?  WHERE channel = ? ', [event.botParams[1], event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.dj = event.botParams[1];
                    bot.notice(event.nick, 'Hai impostato il Dj della stazione radio con successo');
                    bot.tagmsg(event.replyTarget, { '+simosnap.org/radio_update': '1' });
                });
                break;
            }
            case '-dj': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }
                dbCon.query('UPDATE magirc_mediabot_radio SET dj = \'\'  WHERE channel = ? ', [event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.dj = '';
                    bot.notice(event.nick, 'Hai rimosso il Dj della stazione radio con successo');
                });
                dbCon.query('UPDATE magirc_mediabot_radio SET requests = 0  WHERE channel = ? ', [event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.requests = 0;
                    bot.notice(event.nick, 'Rimuovendo il Dj, le richieste musicali sono state disabilitate automaticamente');
                    bot.tagmsg(event.replyTarget, { '+simosnap.org/radio_update': '1' });
                });
                break;
            }
            case 'enableadv': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }
                if (chan.announce === 1) {
                    bot.notice(event.nick, 'Il messaggio promozionale della stazione radio è già abilitato');
                    return;
                }

                dbCon.query('UPDATE magirc_mediabot_radio SET announce = 1  WHERE channel = ? ', [event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.announce = 1;
                    bot.notice(event.nick, 'Hai abilitato l\' invio del messaggio promozionale della stazione radio con successo');

                    if (jobs[chan.name]) {
                        clearInterval(jobs[chan.name]);
                        delete jobs[chan.name];
                    }

                    const prefix = ('Ascolta ' + chan.radioname).irc.teal.bold();
                    const suffix = ('[ https://ilnk.stream/' + shortener.url.keyword + ' ]').irc.teal();

                    const timeoutID = setInterval(() => {
                        const tagData = [
                            chan.radioname,
                            chan.mbID,
                        ];
                        bot.say(chan.name, `🎛 ${prefix} - ${chan.motd} ${suffix}`, { '+simosnap.org/radio_station': tagData.join(';') });
                        // bot.say(chan.name, 'Ascolta ' + chan.radioname + ' - ' + chan.motd + ' https://media.simosnap.com/player/' + chan.mbID, { '+simosnap.org/radio_station': tagData.join(';') });
                    }, (60000 * chan.timer));
                    jobs[chan.name] = timeoutID;
                });
                break;
            }
            case 'disableadv': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }
                dbCon.query('UPDATE magirc_mediabot_radio SET announce = 0  WHERE channel = ? ', [event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.announce = 0;
                    bot.notice(event.nick, 'Hai disabilitato l\' invio del messaggio promozionale della stazione radio con successo');
                    clearInterval(jobs[chan.name]);
                    delete jobs[chan.name];
                });
                break;
            }
            case 'enablenowplay': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }
                if (chan.nowplay === 1) {
                    bot.notice(event.nick, 'L\' invio delle informazioni sullo streming della stazione radio è già abilitato');
                    return;
                }

                dbCon.query('UPDATE magirc_mediabot_radio SET nowplay = 1  WHERE channel = ? ', [event.replyTarget], async function (error, results, fields) {
                    if (error) throw error;
                    chan.nowplay = 1;
                    bot.notice(event.nick, 'Hai abilitato l\' invio delle informazioni sullo streming della stazione radio con successo');

                    if (playjobs[chan.name]) {
                        clearInterval(playjobs[chan.name]);
                        delete playjobs[chan.name];
                    }

                    const timeoutID = setInterval(async() => {
                        const json = await fetch(chan.icestats).then((r) => r.json());
                        if (!json) {
                            return;
                        }

                        const prefix = ('Adesso su ' + chan.radioname).irc.teal.bold();
                        const suffix = ('[ https://ilnk.stream/' + shortener.url.keyword + ' ]').irc.teal();

                        const source = (Array.isArray(json.icestats.source)) ? json.icestats.source[0] : json.icestats.source;

                        const artist = source.artist;
                        const song = source.artist;
                        const nowplay = source.yp_currently_playing;
                        const bitrate = source.bitrate;
                        const colorizedBitrate = (bitrate + ' Kb/s').irc.red();
                        const listeners = source.listeners;
                        const colorizedListeners = listeners.toString().irc.red();

                        const tagData = [
                            nowplay,
                            bitrate,
                            chan.radioname,
                            chan.mbID,
                            listeners,
                        ];
                        bot.say(event.channel, `🎛 ${prefix} - ${nowplay} - ${colorizedBitrate} - ${colorizedListeners} ascoltatori ${suffix}`, { '+simosnap.org/radio_stream': tagData.join(';') });
                        // bot.say(chan.name, '[ Adesso su ' + chan.radioname + ' ] ' + nowplay + ' https://media.simosnap.com/player/' + chan.mbID, { '+simosnap.org/radio_stream': tagData.join(';') });
                    }, (60000 * 5));
                    playjobs[chan.name] = timeoutID;
                });
                break;
            }
            case 'disablenowplay': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }
                dbCon.query('UPDATE magirc_mediabot_radio SET nowplay = 0  WHERE channel = ? ', [event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.nowplay = 0;
                    bot.notice(event.nick, 'Hai disabilitato l\' invio delle informazioni sullo streming della stazione radio con successo');
                    clearInterval(playjobs[event.replyTarget]);
                    delete playjobs[event.replyTarget];
                });
                break;
            }
            case 'enablerequest': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }
                if (chan.dj === '') {
                    bot.notice(event.nick, 'E\' necessario impostare un Dj prima di abilitare la ricezione di richieste musicali');
                    return;
                }
                dbCon.query('UPDATE magirc_mediabot_radio SET requests = 1  WHERE channel = ? ', [event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.requests = 1;
                    bot.notice(event.nick, 'Hai abilitato la ricezione di richieste musicali');
                    bot.tagmsg(event.replyTarget, { '+simosnap.org/radio_update': '1' });
                });
                break;
            }
            case 'disablerequest': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }
                dbCon.query('UPDATE magirc_mediabot_radio SET requests = 0  WHERE channel = ? ', [event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.requests = 0;
                    bot.notice(event.nick, 'Hai disabilitato la ricezione di richieste musicali');
                    bot.tagmsg(event.replyTarget, { '+simosnap.org/radio_update': '1' });
                });
                break;
            }
            case '+www': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }

                if (!event.botParams[1]) {
                    bot.notice(event.nick, 'Devi specificare  l\'indirizzo del sito web');
                    return;
                }

                if (!utils.isValidURL(event.botParams[1])) {
                    bot.notice(event.nick, 'Devi specificare un URL valido');
                    return;
                }

                dbCon.query('UPDATE magirc_mediabot_radio SET website = ?  WHERE channel = ? ', [event.botParams[1], event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.website = event.botParams[1];
                    bot.notice(event.nick, 'Hai impostato il sito web della stazione radio con successo');
                });
                break;
            }
            case '-www': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }
                dbCon.query('UPDATE magirc_mediabot_radio SET website = \'\'  WHERE channel = ? ', [event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.website = '';
                    bot.notice(event.nick, 'Hai rimosso il sito web della stazione radio con successo');
                });
                break;
            }
            case '+twitch': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }

                if (!event.botParams[1]) {
                    bot.notice(event.nick, 'Devi specificare  l\'indirizzo del canale Twitch');
                    return;
                }

                if (!utils.isValidURL(event.botParams[1])) {
                    bot.notice(event.nick, 'Devi specificare un URL valido');
                    return;
                }

                if (!event.botParams[1].match(/^https:\/\/www\.twitch\.tv\/(.+)/)) {
                    bot.notice(event.nick, 'Devi specificare un canale Twitch valido');
                    return;
                }

                dbCon.query('UPDATE magirc_mediabot_radio SET twitch = ?  WHERE channel = ? ', [event.botParams[1], event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.twitch = event.botParams[1];
                    bot.notice(event.nick, 'Hai impostato il canale Twitch della stazione radio con successo');
                    bot.tagmsg(event.replyTarget, { '+simosnap.org/radio_update': '1' });
                });
                break;
            }
            case '-twitch': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }
                dbCon.query('UPDATE magirc_mediabot_radio SET twitch = \'\'  WHERE channel = ? ', [event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.twitch = '';
                    bot.notice(event.nick, 'Hai rimosso il canale Twitch della stazione radio con successo');
                    bot.tagmsg(event.replyTarget, { '+simosnap.org/radio_update': '1' });
                });
                break;
            }
            case 'stats': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }

                if (!event.botParams[1]) {
                    bot.notice(event.nick, 'Devi specificare l\'indirizzo delle statistiche XML di ICECast');
                    return;
                }

                if (!utils.isValidURL(event.botParams[1])) {
                    bot.notice(event.nick, 'Devi specificare un URL valido');
                    return;
                }

                dbCon.query('UPDATE magirc_mediabot_radio SET icestats = ?  WHERE channel = ? ', [event.botParams[1], event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.icestats = event.botParams[1];
                    bot.notice(event.nick, 'Hai impostato l\' indirizzo per le statistiche icecast della stazione radio con successo');
                });
                break;
            }
            case 'logo': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }

                if (!event.botParams[1]) {
                    bot.notice(event.nick, 'Devi specificare  l\'indirizzo del logo della stazione radio');
                    return;
                }

                if (!utils.isValidURL(event.botParams[1])) {
                    bot.notice(event.nick, 'Devi specificare un URL valido');
                    return;
                }

                dbCon.query('UPDATE magirc_mediabot_radio SET logo = ?  WHERE channel = ? ', [event.botParams[1], event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.logo = event.botParams[1];
                    bot.notice(event.nick, 'Hai aggiornato il logo della stazione radio con successo');
                });
                break;
            }
            case 'motd': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }

                let motd = '';
                if (event.botParams[1]) {
                    const argcount = event.botParams.length;
                    for (let i = 1; i < argcount; i++) {
                        if (i >= 1) {
                            motd += event.botParams[i] + ' ';
                        }
                    }
                    motd = motd.trim();
                    // const motd = event.botParams.slice(1).join(' ').trim();
                } else {
                    bot.notice(event.nick, 'Devi specificare il testo del MOTD');
                    return;
                }

                dbCon.query('UPDATE magirc_mediabot_radio SET description = ?  WHERE channel = ? ', [motd, event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.motd = event.botParams[1];
                    bot.notice(event.nick, 'Hai aggiornato il MOTD della stazione radio con successo');
                    bot.tagmsg(event.replyTarget, { '+simosnap.org/radio_update': '1' });
                });
                break;
            }
            case 'timer': {
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }

                if (!event.botParams[1]) {
                    bot.notice(event.nick, 'Devi specificare  un intervallo in minuti per il timer degli annunci');
                    return;
                }

                if (isNaN(event.botParams[1])) {
                    bot.notice(event.nick, 'Il valore dell\' intervallo del timer deve essere un valore numerico');
                    return;
                }

                if (event.botParams[1] < 10) {
                    bot.notice(event.nick, 'Non puoi impostare un intervallo di tempo inferiore a 10 minuti per il timer degli annunci');
                    return;
                }

                if (event.botParams[1] > 60) {
                    bot.notice(event.nick, 'Non puoi impostare un intervallo di tempo superiore a 60 minuti per il timer degli annunci');
                    return;
                }

                dbCon.query('UPDATE magirc_mediabot_radio SET timer = ?  WHERE channel = ? ', [event.botParams[1], event.replyTarget], function (error, results, fields) {
                    if (error) throw error;
                    chan.timer = event.botParams[1];
                    bot.notice(event.nick, 'Hai impostato la frequenza dell\'annuncio ogni ' + event.botParams[1] + ' minuti');
                    if (chan.announce === 1) {
                        clearInterval(jobs[event.replyTarget]);
                        delete jobs[event.replyTarget];

                        const prefix = ('Ascolta ' + chan.radioname).irc.teal.bold();
                        const suffix = ('[ https://ilnk.stream/' + shortener.url.keyword + ' ]').irc.teal();

                        const timeoutID = setInterval(() => {
                            const tagData = [
                                chan.radioname,
                                chan.mbID,
                            ];
                            bot.say(chan.name, `🎛 ${prefix} - ${chan.motd} ${suffix}`, { '+simosnap.org/radio_station': tagData.join(';') });
                            // bot.say(chan.name, 'Ascolta ' + chan.radioname + ' - ' + chan.motd + ' https://media.simosnap.com/player/' + chan.mbID, { '+simosnap.org/radio_station': tagData.join(';') });
                        }, (60000 * event.botParams[1]));
                        jobs[event.replyTarget] = timeoutID;
                    }
                });
                break;
            }
            }
        });
    }
};
