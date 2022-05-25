exports.joinChan = function (bot, newChan, dbCon) {
    return new Promise((resolve, reject) => {
        let removeListeners = null;
        let timeoutID = 0;

        const join = (event) => {
            if (!bot.caseCompare(event.channel, newChan.name)) {
                // does not match the channel
                return;
            }
            if (!bot.caseCompare(event.nick, bot.user.nick)) {
                // not not match the bot nick
                return;
            }
            removeListeners();
            resolve(event.channel);
        };

        const error = (event) => {
            removeListeners();
            reject(new Error(`channel failed to join: ${event.error}`));
        };

        dbCon.query('INSERT INTO magirc_mediabot_main (name) values (?)', [newChan.name], function (error, results, fields) {
            if (error) { reject(error); return; }

            const mbID = results.insertId;
            dbCon.query('INSERT INTO magirc_mediabot_youtube (id, channel, enabled) values (?,?,?)', [mbID, newChan.name, 1], function (error, results, fields) { if (error) { reject(error); } });
            dbCon.query('INSERT INTO magirc_mediabot_mixcloud (id, channel, enabled) values (?,?,?)', [mbID, newChan.name, 1], function (error, results, fields) { if (error) { reject(error); } });
            dbCon.query('INSERT INTO magirc_mediabot_rss (id, channel, enabled,rss) values (?,?,?,?)', [mbID, newChan.name, 0, ''], function (error, results, fields) { if (error) throw error; });
            const obj = { mbID: mbID, radioname: '', motd: '', source: '', icestats: '', logo: '', website: '', twitch: '', nowplay: 0, announce: 0, timer: 10, requests: 0, youtube: 1, mixcloud: 1, rss: 0, subscriptions: '' };
            Object.assign(newChan, obj);
        });

        removeListeners = () => {
            clearTimeout(timeoutID);
            bot.off('join', join);
            bot.off('error', error);
        };

        timeoutID = setTimeout(() => {
            removeListeners();
            reject(new Error('join timed out'));
        }, 4000);

        bot.on('join', join);
        bot.on('error', error);

        bot.join(newChan.name);
    });
};

exports.partChan = function (bot, remChan, dbCon) {
    return new Promise((resolve, reject) => {
        let removeListeners = null;
        let timeoutID = 0;

        const part = (event) => {
            if (!bot.caseCompare(event.channel, remChan.name)) {
                // does not match the channel
                return;
            }
            if (!bot.caseCompare(event.nick, bot.user.nick)) {
                // not not match the bot nick
                return;
            }
            removeListeners();
            resolve(event.channel);
        };

        const error = (event) => {
            removeListeners();
            reject(new Error(`channel failed to part: ${event.error}`));
        };

        dbCon.query('DELETE FROM magirc_mediabot_main WHERE name = ?', [remChan.name], function (error, results, fields) {
            if (error) { reject(error); }
        });

        removeListeners = () => {
            clearTimeout(timeoutID);
            bot.off('part', part);
            bot.off('error', error);
        };

        timeoutID = setTimeout(() => {
            removeListeners();
            reject(new Error('join timed out'));
        }, 4000);

        bot.on('part', part);
        bot.on('error', error);

        bot.part(remChan.name);
    });
};
