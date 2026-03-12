const axios = require('axios');
const crypto = require('crypto');

exports.handler = async (event) => {
    const API_KEY = '882a8490361da98702bf97a021ddc14d';
    const SECRET = '62f8ce9f74b12f84c123cc23437a4a32';
    
    const queryDomain = event.queryStringParameters.domain || 'random';
    const yearRange = event.queryStringParameters.years || '1990-2013';
    const manualFname = event.queryStringParameters.fname;
    const manualLname = event.queryStringParameters.lname;
    const manualPass = event.queryStringParameters.pass;

    try {
        const domains = ["timpmeyl.indevs.in", "nmeyl.indevs.in", "hypermeyl.indevs.in", "qnmeyl.indevs.in", "nqnmeyl.indevs.in"];
        let domain = queryDomain === 'random' ? domains[Math.floor(Math.random() * domains.length)] : queryDomain;

        const login = Math.random().toString(36).substring(2, 12);
        const email = `${login}@${domain}`;
        const password = manualPass || ("Pass" + Math.floor(Math.random() * 99999) + "!");

        const namesPool = [
            {f: "John", l: "Smith"}, {f: "Emily", l: "Chen"}, {f: "Michael", l: "Lee"}, {f: "Sarah", l: "Patel"},
            {f: "William", l: "Garcia"}, {f: "Olivia", l: "Kim"}, {f: "James", l: "Wong"}, {f: "Ava", l: "Tan"}
        ];

        let fname, lname;
        if (manualFname && manualLname) {
            fname = manualFname; lname = manualLname;
        } else {
            const selected = namesPool[Math.floor(Math.random() * namesPool.length)];
            fname = selected.f; lname = selected.l;
        }

        const genderVal = Math.random() > 0.5 ? 'M' : 'F';
        const [startYear, endYear] = yearRange.split('-').map(Number);
        const year = Math.floor(Math.random() * (endYear - startYear + 1)) + startYear;
        const bday = `${year}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`;

        const params = {
            'api_key': API_KEY,
            'attempt_login': 'true',
            'birthday': bday,
            'client_country_code': 'PH',
            'email': email,
            'firstname': fname,
            'lastname': lname,
            'gender': genderVal,
            'locale': 'en_US',
            'method': 'user.register',
            'password': password,
            'reg_instance': crypto.randomBytes(16).toString('hex'),
            'return_multiple_errors': 'true'
        };

        const sortedKeys = Object.keys(params).sort();
        let sigString = "";
        sortedKeys.forEach(key => { sigString += `${key}=${params[key]}`; });
        params['sig'] = crypto.createHash('md5').update(sigString + SECRET).digest('hex');

        const fbResponse = await axios.post('https://b-api.facebook.com/method/user.register', 
            new URLSearchParams(params).toString(), 
            { headers: { 'User-Agent': '[FBAN/FB4A;FBAV/35.0.0.48.273;]' } }
        );

        const data = fbResponse.data;

        return {
            statusCode: 200,
            body: JSON.stringify({
                status: "FB_CREATED",
                email: email,
                password: password,
                name: `${fname} ${lname}`,
                gender: genderVal === 'M' ? 'Male' : 'Female',
                birthday: bday,
                fb_id: data.new_user_id || "N/A",
                token: data.access_token || "N/A",
                session: data.session_info ? JSON.stringify(data.session_info) : "N/A"
            })
        };
    } catch (e) {
        return { statusCode: 200, body: JSON.stringify({ status: "ERROR", message: e.message }) };
    }
};
