/*jslint sub:true */
var LibreOfficeDoctype = ['doc', 'docx', 'xml', 'txt', 'cvs', 'rtf', 'html', 'xls', 'xlsx', 'ppt', 'pptx', 'pot'],
    MsOfficeDocType = ['mht', 'docx', 'docm', 'doc', 'odt', 'xlsx', 'xls', 'xlw', 'ods', 'ppt', 'pptx', 'pptm', 'ppsx', 'pps', 'odp'],
    HASH_DIR_PART_SIZE = 1,
    HASH_DIR_NUM_PARTS = 4,
    DEFAULT_MAX_FILE_SIZE = 1024*1024*6,
    DEFAULT_DOC_FOLDER = "var/doc/",
    DEFAULT_PDF_CONVERT_TIMEOUT = 60*5,
    DEFAULT_IMAGE_CONVERT_TIMEOUT =  60*3,
    DEFAULT_IMAGE_DENSITY = 96,
    DEFAULT_TARGET_IMAGE_TYPE = 'png',
    ERROR_MAX = 3,
    TAG_END = 'finish',
    TAG_ERROR = 'error',
    PROP_NAME = 'doc',
    path = require('path'),
    fs = require('fs'),
    crypto = require('crypto'),
    exec = require('child_process').exec;

function intranetIpaddress (req) {
    var addr = req.socket.remoteAddress,
        list = this.config.allowedIpaddress,
        i;
    
    for (i = 0; i < list.length; i++) {
        if (addr.match(list[i])) return true;
    }
    return false;
}

/*
 * nodeSide doc-plugin class
 */
function MMP_doc(mm, plugin_config){
    var self = this;
    
    plugin_config['docfolder'] = plugin_config['docfolder'] || DEFAULT_DOC_FOLDER;
    if (isNaN(Number(plugin_config['maxFileSize']))) {
        plugin_config['maxFileSize'] = DEFAULT_MAX_FILE_SIZE;
    }
    plugin_config['pdfConvertTimeout'] = plugin_config['pdfConvertTimeout'] || DEFAULT_PDF_CONVERT_TIMEOUT;
    plugin_config['imageConvertTimeout'] = plugin_config['imageConvertTimeout'] || DEFAULT_IMAGE_CONVERT_TIMEOUT;
    plugin_config['imageDensity'] = plugin_config['imageDensity'] || DEFAULT_IMAGE_DENSITY;
    plugin_config['targetImageType'] = plugin_config['targetImageType'] || DEFAULT_TARGET_IMAGE_TYPE;
    plugin_config['allowedIpaddress'] = plugin_config['allowedIpaddress'] || [/.*/];
    
    if (!fs.existsSync(path.resolve(rootdir, plugin_config['docfolder']))) {
        mm.util.fs.mkdirr(path.resolve(rootdir, plugin_config['docfolder']));
    }
    this.config = plugin_config;
    this.mm = mm;
    this._docfolder = path.resolve(mm._rootdir, plugin_config['docfolder']);
    this._queue = [];
    this._busy = false;

    mm.register(this, PROP_NAME);
    
    mm.app.use(this.mm.util.slash_url(this.mm.config.urlprefix) + this.mm.util.slash_url(this.config.urlspace), this.mm.express.bodyParser());
    mm.app.use(this.mm.util.slash_url(this.mm.config.urlprefix) + this.mm.util.slash_url(this.config.urlspace) + '/put', function(req, res, next) {
        self._webput(req, res, next);
    });
    mm.app.use(this.mm.util.slash_url(this.mm.config.urlprefix) + this.mm.util.slash_url(this.config.urlspace) + '/get', function(req, res, next) {
        self._webget(req, res, next);
    });
    mm.app.use(this.mm.util.slash_url(this.mm.config.urlprefix) + this.mm.util.slash_url(this.config.urlspace) + '/query', function(req, res, next) {
        self._webquery(req, res, next);
    });
}
/*
 * upload form should has the following fields:
 *      filename origin filename with extension
 *      file
 */
MMP_doc.prototype._webput = function (req, res, next) {
    var filedata, filename;
    
    if (!this.intranetIpaddress(req)) {
        return res.send(403, 'Forbidden');
    }
    if (req.method.toUpperCase() !== 'POST' && req.method.toUpperCase() !== 'OPTION') {
        return res.send(405, 'Method Not Allowed');
    }
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'origin, content-type');
    res.set('Access-Control-Allow-Origin', req.headers['origin'] || '*');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.set('Access-Control-Max-Age', '3628800');
    if (req.method.toUpperCase() !== 'OPTION') {
        return res.end();
    }
    filename = req.param('filename');
    filedata = req.files.file;
    if (!filename || !filedata) {
        return res.send(400, 'Bad Request');
    }
    filedata = fs.readFileSync(filedata.path);
    res.send(200, this.put(filedata, filename));
};
/*
 * need md5 param
 */
MMP_doc.prototype._webquery = function (req, res, next) {
    var md5 = req.param('md5'),
        info;
    
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'origin, content-type');
    res.set('Access-Control-Allow-Origin', req.headers['origin'] || '*');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.set('Access-Control-Max-Age', '3628800');
    if (req.method.toUpperCase() !== 'OPTION') {
        return res.end();
    }
    info = this.query(md5);
    if (!info) {
        res.send(400, 'Bad Request');
    } else {
        res.json(200, info);
    }
};
/*
 * need md5 and page params.
 *      if success, return file
 *      if fail, return json contain info from get method
 */
MMP_doc.prototype._webget = function (req, res, next) {
    var md5 = req.param('md5'),
        page = req.param('md5'),
        info;
    
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'origin, content-type');
    res.set('Access-Control-Allow-Origin', req.headers['origin'] || '*');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.set('Access-Control-Max-Age', '3628800');
    if (req.method.toUpperCase() !== 'OPTION') {
        return res.end();
    }
    info = this.get(md5, page, true);
    if (info.error !== 0) {
        res.json(400, info);
    } else {
        res.sendfile(info.filepath);
    }
};

MMP_doc.prototype._getinfo = function (md5) {
    var pathstr = this._md5topath(md5),
        rootfolder = path.resolve(this._docfolder, pathstr),
        pdfend = false, finished = false, MSparsable = false, LBparsable = false,
        filetype = '', filename = '', filenamewithouttype = '', filenamearr = null,
        filesize = -1, pagecount = -1, errcount = -1, 
        tmp, i;
        
    
    if (!fs.existsSync(rootfolder)) return null;
    filename = fs.readdirSync(path.join(rootfolder, 'origin'))[0];
    filenamearr = filename.split('.');
    filesize = fs.statSync(path.join(rootfolder, 'origin', filename)).size;
    if (filenamearr.length > 1) {
        filetype = filenamearr.pop().toLowerCase();
        filenamewithouttype = filenamearr.join('.');
    } else {
        filetype = '';
        filenamewithouttype = filename;
    }
    if (filetype && this.config.msoffice2pdf) {
        for (i = 0; i < MsOfficeDocType.length; i++) {
            if (filetype === MsOfficeDocType[i]) {
                MSparsable = true;
                break;
            }
        }
    }
    if (filetype && this.config.libreoffice2pdf) {
        for (i = 0; i < LibreOfficeDoctype.length; i++) {
            if (filetype === LibreOfficeDoctype[i]) {
                LBparsable = true;
                break;
            }
        }
    }
    if (filesize > this.config.maxFileSize) {
        MSparsable = LBparsable = false;
    }
    finished = fs.existsSync(path.join(rootfolder, TAG_END));
    if (fs.existsSync(path.join(rootfolder, TAG_ERROR))) {
        errcount = Number(fs.readFileSync(path.join(rootfolder, TAG_ERROR), {encoding: 'utf8'}));
    } else {
        errcount = -1;
    }
    if (finished) {
        tmp = fs.readdirSync(path.join(rootfolder, 'image'));
        pagecount = tmp.length;
        pdfend = true;
    } else {
        pagecount = -1;
        pdfend = false;
        tmp = fs.readdirSync(path.join(rootfolder, 'pdf'));
        if (tmp.length > 0) {
            pdfend = tmp[0] === filenamewithouttype + '.' + 'pdf';
        }
    }
    return {
        pathstr: pathstr,
        rootfolder: rootfolder,
        MSparsable: MSparsable,
        LBparsable: LBparsable,
        filename: filename,
        filenamewithouttype: filenamewithouttype,
        filetype: filetype,
        filesize: filesize,
        pagecount: pagecount,
        errcount: errcount,
        finished: finished,
        pdfend: pdfend
    };
};

MMP_doc.prototype._checkqueue = function (){
    var self = this,
        md5, info;
    
    if (this._busy || this._queue.length === 0) return;
    md5 = this._queue[0];
    info = this._getinfo(md5);
    if (info && !info.finished && (info.errcount < ERROR_MAX) && (info.MSparsable || info.LBparsable)) {
        this._convert(md5);
    } else {
        if (info && !info.finished) {         
            if ((info.errcount >= ERROR_MAX) || (!info.MSparsable && !info.LBparsable)) {
                fs.writeFileSync(path.join(info.rootfolder, TAG_ERROR), '' + (ERROR_MAX + 1), {encoding: 'utf8'});
            }
            fs.writeFileSync(path.join(info.rootfolder, TAG_END), '', {encoding: 'utf8'});
        }
        this._queue.shift();
        process.nextTick(function () {
            self._checkqueue();
        });
    }
};

MMP_doc.prototype._convert = function (md5) {
    var self = this,
        libreofficescript = path.resolve(__dirname, 'support', 'scripts', 'unoconv'),
        msofficescript = path.resolve(__dirname, 'support', 'scripts', 'msoffice2pdf.py'),
        info, cmdstr, option;
    
    if (this._busy) return;
    this._busy = true;
    info = this._getinfo(md5);
    
    if (info.pdfend) {
        option = {
            timeout: this.config.imageConvertTimeout * 1000,
            cwd: path.join(rootfolder, 'pdf')
        };
        cmdstr = 'convert -density ' + this.config.imageDensity + 
                 ' ' + info.filenamewithouttype + '.pdf' + ' ..' + path.sep + 'image' + path.sep + 
                 info.filenamewithouttype + '.' + this.config.targetImageType;
        exec(cmdstr, option, function (error, stdout, stderr) {
            stderr = stderr.toString();
            if (error) {
                console.error('MMP_doc: error during image converting --- ' + path.join(info.pathstr, info.filenamewithouttype + '.pdf') + '\n' + stderr);
                console.error('\t' + stderr);
                fs.writeFileSync(path.join(info.rootfolder, TAG_ERROR), '' + (info.errcount + 1), {encoding: 'utf8'}); 
            } else {
                if (fs.existsSync(path.join(info.rootfolder, TAG_ERROR))) {
                    fs.unlinkSync(path.join(info.rootfolder, TAG_ERROR));
                }
                fs.writeFileSync(path.join(info.rootfolder, TAG_END), '', {encoding: 'utf8'});
            }
            this._busy = false;
            process.nextTick(function () {
                self._checkqueue();
            });
        });
    } else {
        option = {
            timeout: this.config.pdfConvertTimeout * 1000,
            cwd: path.join(info.rootfolder, 'origin')
        };
        if (this.config.msoffice2pdf) {
            cmdstr = 'python "' + msofficescript + '"' + ' -o "';
        } else {
            cmdstr = 'python "' + libreofficescript + '"' + ' -o "';
        }
        cmdstr += path.join(info.rootfolder, 'pdf', info.filenamewithouttype + '.pdf') + '" "' + path.join(info.rootfolder, 'origin', info.filename) + '"';
        exec(cmdstr, option, function (error, stdout, stderr) {
            stderr = stderr.toString();
            if (error) {
                console.error('MMP_doc: error during pdf converting --- ' + path.join(info.pathstr, info.filename) + '\n' + stderr);
                console.error('\t' + stderr);
                if (fs.existsSync(path.join(info.rootfolder, 'pdf', info.filenamewithouttype + '.pdf '))){
                    fs.unlinkSync(path.join(info.rootfolder, 'pdf', info.filenamewithouttype + '.pdf '));
                }
                fs.writeFileSync(path.join(info.rootfolder, TAG_ERROR), '' + (info.errcount + 1), {encoding: 'utf8'});
            }
            this._busy = false;
            process.nextTick(function () {
                self._checkqueue();
            });
        });
    }
};

MMP_doc.prototype._md5topath = function (md5) {
    var str = '',
        i;
    
    for (i = 0; i < HASH_DIR_NUM_PARTS; i++){
        str += md5.substr(i * HASH_DIR_PART_SIZE, HASH_DIR_PART_SIZE) + '/';
    }
    str += md5.substr(HASH_DIR_PART_SIZE * HASH_DIR_NUM_PARTS);
};

MMP_doc.prototype._volidmd5 = function (md5) {
    return (typeof md5 === 'string') && (md5.match(/^[0-9a-f]{32}$/));
};

/*
 * Save file content
 * Params:
 *     md5 string       file md5 string
 *     databuff buffer  contains file data
 *     filename string  filename 
 *      
 * this is a synchronous method(slow and cpu heavy), return md5 string. May throw error.
 */
MMP_doc.prototype.put = function (databuff, filename) {
    var self = this,
        hash = crypto.createHash('md5'),
        md5 = '', pathstr = '';
    
    hash.update(databuff);
    md5 = hash.digest('hex');
    //different filenames can have the same data, so we md5 it with filename again
    hash = crypto.createHash('md5');
    hash.update(md5, 'utf8');
    md5 = hash.digest('hex');
    pathstr = this._md5topath(md5);
    if (fs.existsSync(path.join(this._docfolder, pathstr))) {
        return md5;
    } else {
        fs.mkdirSync(path.join(this._docfolder, pathstr, 'origin'));
        fs.mkdirSync(path.join(this._docfolder, pathstr, 'pdf'));
        fs.mkdirSync(path.join(this._docfolder, pathstr, 'image'));
        fs.writeFileSync(path.join(this._docfolder, pathstr, 'origin', filename), databuff);
        process.nextTick(function () {
            self._queue.push(md5);
            self._checkqueue();
        });
        return md5;
    }
};

/*
 * Query the target file converting status
 * Params:
 *     md5 string       file md5 string
 */
MMP_doc.prototype.query = function (md5) {
    var info;
    
    if (this._volidmd5(md5)) {
        info = this._getinfo(md5);
        return {
            md5: md5,
            finished: info.finished,
            error: info.errcount !== -1,
            filename: info.filename,
            pagecount: info.pagecount,
            filesize: info.filesize
        };
    } else {
        return null;
    }
};

/*
 * Get the target converted file.
 * Params:
 *     md5 string       file md5 string
 *     page number      0 mean get the origin file, 
 *                      others mean get the converted image picture.
 *                      when page exceed pagecount, always return last page.
 *     pathOnly boolean return file path instead of file data
 * return {
 *     data: buffer     file data(only when pathOnly is not true)
 *     filename: string the origin file name
 *     filepath: string file path(only when pathOnly is true)
 *     error: number
 *                      0 mean success
 *                      1 mean file no found
 *                      2 mean get image but converting not finish
 *                      3 mean get image but has convert error
 *                      4 mean bad md5 or bad page
 * } 
 */
MMP_doc.prototype.get = function (md5, page, pathOnly) {
    var info;
    
    page = Number(page);
    if (!this._volidmd5(md5) || isNaN(page) || page < 0) {
        return {
            data: null,
            filename: null,
            error: 4
        };
    }
    info = this._getinfo(md5);
    if (!info) {
        return {
            data: null,
            filename: null,
            error: 1
        };
    }
    if (page === 0) {
        if (pathOnly) {
            return {
                filepath: path.join(info.rootfolder, 'origin', info.filename),
                filename: info.filename,
                error: 0
            };
        } else {
            return {
                data: fs.readFileSync(path.join(info.rootfolder, 'origin', info.filename)),
                filename: info.filename,
                error: 0
            };
        }
    } else {
        if (!info.finished) {
            return {
                data: null,
                filename: info.filename,
                error: 2
            };
        }
        if (info.errcount !== -1) {
            return {
                data: null,
                filename: info.filename,
                error: 3
            };
        }
        page--;
        if (page === 0) {
            if (fs.existsSync(path.join(info.rootfolder, 'image', info.filenamewithouttype + '.' + this.config.targetImageType))) {
                if (pathOnly) {
                    return {
                        filepath: path.join(info.rootfolder, 'image', info.filenamewithouttype + '.' + this.config.targetImageType),
                        filename: info.filename,
                        error: 0
                    };
                } else {
                    return {
                        data: fs.readFileSync(path.join(info.rootfolder, 'image', info.filenamewithouttype + '.' + this.config.targetImageType)),
                        filename: info.filename,
                        error: 0
                    };
                }
            } 
        }
        if (fs.existsSync(path.join(info.rootfolder, 'image', info.filenamewithouttype + '-' + page +'.' + this.config.targetImageType))) {
            if (pathOnly) {
                return {
                    filepath: path.join(info.rootfolder, 'image', info.filenamewithouttype + '-' + page +'.' + this.config.targetImageType),
                    filename: info.filename,
                    error: 0
                };
            } else {
                return {
                    data: fs.readFileSync(path.join(info.rootfolder, 'image', info.filenamewithouttype + '-' + page +'.' + this.config.targetImageType)),
                    filename: info.filename,
                    error: 0
                };
            }      
        } else {
            return {
                data: null,
                filename: info.filename,
                error: 1
            };
        }
    }
};

module.exports = MMP_doc;