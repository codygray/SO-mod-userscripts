// ==UserScript==
// @name         Userlink Tooltips
// @description  Display reputation in tooltip upon user link mouseover
// @homepage     https://github.com/samliew/SO-mod-userscripts
// @author       @samliew
// @version      1.0
//
// @include      https://*stackoverflow.com/*
// @include      https://*serverfault.com/*
// @include      https://*superuser.com/*
// @include      https://*askubuntu.com/*
// @include      https://*mathoverflow.net/*
// @include      https://*.stackexchange.com/*
//
// @exclude      *chat.*
// @exclude      https://stackoverflow.com/c/*
// ==/UserScript==


(function() {
    'use strict';


    const apikey = '6WNNW7fOBHWKrUmONL3Row((';


    // Get user info
    function getUserInfo(arrUids) {
        return new Promise(function(resolve, reject) {
            if(typeof arrUids === 'undefined' || arrUids === null || arrUids.length == 0) { reject(); return; }

            $.get(`http://api.stackexchange.com/2.2/users/${arrUids.join(';')}/?pagesize=100&order=desc&sort=reputation&site=${location.hostname}&filter=!40D5EWXuPI9Z0caGy&key=${apikey}`)
                .done(function(data) {
                    resolve(data.items);
                    return;
                })
                .fail(reject);
        });
    }


    function processUserlinks() {

        // Only userlinks without title and data-uid attributes
        const userlinks = $('a[href*="/users/"]').filter((i, el) => el.title === '' && typeof el.dataset.uid === 'undefined').each(function(i, el) {
            const id = (el.href.match(/\d+/) || ['']).pop();
            el.dataset.uid = id; // set computed data-uid
        });

        // Get array of non-empty and unique uids
        const uids = userlinks.map((i, el) => el.dataset.uid).get().filter((v, i, self) => v !== '' && self.indexOf(v) === i);

        if(uids.length == 0) return;

        getUserInfo(uids).then(function(users) {
            users.forEach(function(user) {
                userlinks.filter((i, el) => user.user_id == el.dataset.uid).attr('title', `${user.reputation.toLocaleString('en-US')} reputation`);
            });
        });
    }


    function listenToPageUpdates() {

        // On page update complete
        $(document).ajaxStop(processUserlinks);
    }


    // On page load
    processUserlinks();
    listenToPageUpdates();

})();
