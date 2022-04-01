exports.joinChan = function (bot, newChan, dbCon) {

    return new Promise((resolve, reject) => {
        let removeListeners = null;
        let timeoutID = 0;

        const chanJoin = (event) => {
            removeListeners();
            if (event.channel !== newChan) {
                return reject('unexpected channel in join event');
            }
            resolve(chanJoin);
        };

        const cantJoin = (event) => {
            removeListeners();
            reject('join error');
        };

        removeListeners = () => {
            clearTimeout(timeoutID);
            bot.off('join', chanJoin);
            bot.off('irc error', cantJoin);
        };

        timeoutID = setTimeout(() => {
            removeListeners();
            reject('nick change timed out');
        }, 4000);

        bot.on('join', chanJoin);
        bot.on('nick in use', cantJoin);

        dbCon.query('INSERT INTO magirc_mediabot_main (name) values (?)', [newChan], function (error, results, fields) {
            if (error) {
                throw error;
            } else {
                const mbID = results.insertId;
                dbCon.query('INSERT INTO magirc_mediabot_youtube (id, channel, enabled) values (?,?,?)', [mbID, newChan, 1], function (error, results, fields) { if (error) throw error; });
                dbCon.query('INSERT INTO magirc_mediabot_mixcloud (id, channel, enabled) values (?,?,?)', [mbID, newChan, 1], function (error, results, fields) { if (error) throw error; });
                const obj = { mbID: mbID, radioname: '', motd: '', source: '', icestats: '', logo: '', website: '', twitch: '', nowplay: 0, announce: 0, timer: 0, requests: 0, youtube: 1, mixcloud: 1 };
                Object.assign(newChan, obj);
                bot.join(newChan);
            }
        });
        

    });
};
