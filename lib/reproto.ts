import * as https from 'https';
import * as fs from 'fs';
import * as tar from 'tar';
import * as os from 'os';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import * as request from 'request';
import * as child_process from 'child_process';

const ME = 'reproto-js';
const REPO = 'reproto/reproto';
const CACHE_DIR = path.join(os.homedir(), '.reproto-js-cache');
const RELEASE_FILE = path.join(CACHE_DIR, 'release');
const BIN_DIR = path.join(CACHE_DIR, ".bin");
const FILE_BASE = 'reproto';
const DOWNLOAD_THRESHOLD = 1000 * 60 * 60;

function get_arch(): string {
    switch (process.arch) {
        case 'x64':
            return 'x86_64';
        default:
            break;
    }

    throw new Error('Unsupported architecture: ' + process.arch);
}

function get_os(): string {
    switch (process.platform) {
        case 'linux':
            return 'linux';
        case 'darwin':
            return 'osx';
    }

    throw new Error('Unsupported OS: ' + process.platform);
}

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

    return await read_file(RELEASE_FILE).then(value => value.trim());
}

function write_release_file(version: string): Promise<void> {
    return new Promise<void>((resolve, reject) => fs.writeFile(RELEASE_FILE, version + '\n', function(err) {
        if(err) {
            reject(err);
            return;
        }

        resolve();
    }));
}

async function should_check_for_updates(release_version: string): Promise<boolean> {
    if (release_version != null) {
        const release_stat = await stats(RELEASE_FILE);
        const diff = Date.now() - release_stat.mtime.getTime();

        return diff > DOWNLOAD_THRESHOLD;
    }

    return true;
}

async function ensure_directory_exists(path: string): Promise<void> {
    if (await exists(path)) {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        mkdirp(path, e => {
            if (e) {
                reject(e);
                return;
            }
            resolve();
        });
    });
}

function unpack_archive(source: string, dir: string): Promise<void> {
    return (tar as any).extract({
        file: source,
        cwd: dir,
    });
}

async function download_cache(): Promise<string> {
    let arch = get_arch();
    let os = get_os();

    await ensure_directory_exists(CACHE_DIR);
    await ensure_directory_exists(BIN_DIR);

    let release_version = await read_release_file();

    let should_download = false;

    if (await should_check_for_updates(release_version)) {
        console.info(`${ME}: Checking for new version`);

        const upstream_version = (await latest_version()).trim();

        if (upstream_version != release_version) {
            should_download = true;
        }

        release_version = upstream_version;
    }

    let file_name = `${FILE_BASE}-${release_version}-${os}-${arch}.tar.gz`;
    let local_file = path.join(CACHE_DIR, file_name);
    let download_file = `https://github.com/${REPO}/releases/download/${release_version}/${file_name}`;

    let bin_path = path.join(BIN_DIR, "reproto");

    if (!await exists(local_file) || should_download) {
        var file = fs.createWriteStream(local_file);

        await new Promise<any>((resolve, reject) => {
            const r = request.get(download_file);
            r.on('error', reject);
            r.on('end', resolve);
            r.pipe(file);
        });

        console.log(`${ME}: Downloaded ${local_file}`);
    }

    if (!await exists(bin_path) || should_download) {
        console.log(`${ME}: Unpacking ${BIN_DIR}`);
        await unpack_archive(local_file, BIN_DIR);
    }

    if (should_download) {
        await write_release_file(release_version);
    }

    if (!await exists(bin_path)) {
        throw new Error(`${ME}: Binary does not exist: ${bin_path}`);
    }

    return bin_path;
}

export function entry() {
    download_cache().then(bin => {
        let argv = process.argv;
        argv.shift();
        argv.shift();

        let child = child_process.spawn(bin, argv, {
            cwd: process.cwd(),
            env: process.env,
            detached: true,
        });

        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stderr);
        child.on('close', (code) => {
            process.exit(code);
        });
    }).catch(e => {
        console.error(e);
        process.exit(1);
    });
};
