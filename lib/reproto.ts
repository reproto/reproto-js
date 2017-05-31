import * as https from 'https';
import * as fs from 'fs';
// import * as tar from 'tar';
import * as os from 'os';
import * as path from 'path';
import * as mkdirp from 'mkdirp';

const REPO = 'reproto/reproto';
const CACHE_DIR = path.join(os.homedir(), '.reproto-js-cache');
const RELEASE_FILE = path.join(CACHE_DIR, 'release');
const DOWNLOAD_THRESHOLD = 0; // 1000 * 60 * 60 * 24;

function github_get(path: string): Promise<any> {
    return new Promise<string>((resolve, reject) => {
        https.get({
            host: 'api.github.com',
            path: path,
            headers: {'User-Agent': 'Reproto-CLI'},
        }, function(response) {
            var body = '';

            response.on('data', (d) => {
                body += d;
            });

            response.on('error', reject);

            response.on('end', () => {
                resolve(JSON.parse(body));
            });
        });
    });
}

function read_file(path: string): Promise<string> {
    return new Promise<string>((resolve, reject) => fs.readFile(path, 'utf8', (err, data) => {
        if (err) {
            reject(err);
            return;
        }

        resolve(data);
    }));
}

async function exists(path: string): Promise<boolean> {
    return new Promise<boolean>((resolve, _) => {
        fs.exists(path, resolve);
    });
}

async function stats(path: string): Promise<fs.Stats> {
    return new Promise<fs.Stats>((resolve, reject) => fs.stat(path, (err, stats) => {
        if (err) {
            reject(err);
            return;
        }

        resolve(stats);
    }));
}

async function latest_version(): Promise<string> {
    return github_get('/repos/' + REPO + '/releases').then(releases => releases[0].tag_name);
}

async function read_release_file(): Promise<string> {
    if (!await exists(RELEASE_FILE)) {
        return null;
    }

    return await read_file(RELEASE_FILE);
}

async function should_check_for_updates(release_version: string): Promise<boolean> {
    if (release_version != null) {
        const release_stat = await stats(RELEASE_FILE);
        const diff = Date.now() - release_stat.mtime.getTime();

        if (diff < DOWNLOAD_THRESHOLD) {
            console.log("not checking for new version since " + RELEASE_FILE + " is fresh");
            return false;
        }
    }

    return true;
}

async function download_cache(): Promise<void> {
    if (!await exists(CACHE_DIR)) {
        console.log("Creating directory: " + CACHE_DIR);

        const p = new Promise<void>((resolve, reject) => {
            mkdirp(CACHE_DIR, e => {
                if (e) {
                    reject(e);
                    return;
                }
                resolve();
            });
        });

        await p;
    }

    let release_version = (await read_release_file()).trim();

    if (should_check_for_updates(release_version)) {
        console.log("checking for new version");

        const upstream_version = (await latest_version()).trim();

        if (upstream_version != release_version) {
            // TODO: download file!
            /*var file = fs.createWriteStream("file.jpg");

            var request = http.get("http://i3.ytimg.com/vi/J---aiyznGQ/mqdefault.jpg", function(response) {
                response.pipe(file);
            });*/
        }

        release_version = upstream_version;
    } else {
        console.log("not checking for a new version");
    }
}

export function entry() {
    download_cache().then(() => {
        console.log("OK!");
    }).catch(e => {
        console.error("Error :(", e);
    });
};
