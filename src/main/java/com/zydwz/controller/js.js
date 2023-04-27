import axios from "axios";
import {Toast} from 'vant';
import _ from "lodash";
import md5 from 'js-md5';
import Compressor from 'compressorjs';
import * as imageConversion from 'image-conversion';

import {router} from "./router";

const httpClient = axios.create();

httpClient.interceptors.response.use(function (response) {
    // 对响应数据做点什么
    return response;
}, function (error) {
    // 对响应错误做点什么
    if (error.message.includes('timeout')) {   // 判断请求异常信息中是否含有超时timeout字符串
        Toast("网络超时");
    } else if (error.message.includes('Network Error')) {   // 判断请求异常信息中是否含有超时timeout字符串
        Toast("网络错误");
    } else if (error.message.includes('status code 401')) {   // 判断请求异常信息中是否含有401未授权
        handleTokenError();
    }
    return Promise.reject(error);
});

let baseUrl;

//let timeout = 30000;

const userInfoKey = '==%%USER_INFO=='

function setUserInfo(userInfo) {
    if (_.isEmpty(userInfo)) {
        Toast.fail('未获取到用户信息')
        return;
    }
    storage.setItemJson(userInfoKey, userInfo);
}

function getToken() {
    var accessToken = getUserInfo().accessToken;
    return accessToken;
}

function getUserInfo() {
    let userInfo = storage.getItemJson(userInfoKey);
    return userInfo;
}

function clearUserInfo() {
    storage.clear();
}

function isLogin() {
    return !_.isEmpty(getToken());
}

let storage = {
    setItemJson: function (name, json) {
        if (_.isEmpty(json)) {
            json = {};
        }
        var jsonStr = JSON.stringify(json);
        localStorage.setItem(name, jsonStr);
    },
    getItemJson: function (name) {
        var jsonStr = localStorage.getItem(name)
        if (_.isEmpty(jsonStr)) {
            return {};
        }
        return JSON.parse(jsonStr);
    },
    clear: function () {
        localStorage.clear();
    }
}

let Cookie = {
    setCookie: function (key, value, age) {
        //设置方式就是在cookie添加时，写完value之后，用分号隔开，
        //将max-age属性的值设置好，如下设置最大生命长度为一天
        document.cookie = key + "=" + value + ";"
            + "max-age" + "=" + (_.isNaN(age) ? "-1" : age);
        // max-age属性的值如果设置为小于零，则表示cookie为临时cookie，其实就和默认效果是一样的，即在浏览器关闭时删除；
        // max-age属性的值如果设置为等于零，则表示立即删除该cookie；
        // max-age属性的值如果设置为大于零，表示存活时间；
    },
    setCookieExDate: function (key, value, date) {
        if (!date.isDate()) {
            Toast("过期时间不不是日期格式");
            return;
        }
        document.cookie = key + "=" + value + ";"
            + "expires" + "=" + date.toUTCString();
    },
    getCookie: function (key) {
        var arr = document.cookie.match(new RegExp("(^| )" + key + "=([^;]*)(;|$)"));
        if (arr != null) {
            return decodeURIComponent(arr[2]);
        } else {
            return null;
        }
    },
    delCookie: function (key) {
        document.cookie = key + "=;max-age=0"
    },
}

async function login(loginName, password) {
    let data = await proSend("system.security.Security.touchLogin", {
        loginName: loginName,
        password: md5(password)
    }, '/security/touchDoLogin');
    setUserInfo(data.userInfo)
    return data;
}

async function loginByCode(tel, verificationCode) {
    let data = await proSend("touch.system.TouchSecurity.touchLogin", {
        tel: tel,
        verificationCode: verificationCode
    }, '/security/touchLoginByCode');
    setUserInfo(data.userInfo)
    return data;
}

async function register(tel, password, verificationCode) {
    let data = await proSend("touch.system.TouchSecurity.touchRegister", {
        tel: tel,
        password: md5(password),
        verificationCode: verificationCode
    }, '/security/touchRegister');
    setUserInfo(data.userInfo)
    return data;
}

async function get(url, data, config) {
    return await httpClient.get(url, config);
}

async function post(url, data, config) {
    return await httpClient.post(url, data, {timeout: 30000});
}

// application/x-www-form-urlencoded

async function proSend(port, params, url) {
    let data = {
        portName: port,
        requestData: JSON.stringify({
            data: {
                ...params,
            }
        })
    }
    let res = await post(url, data);
    return parseData(res);
}


async function callPort(option, url) {
    let defOpt = {
        portName: '',
        data: {},
        async: true,
        needLoading: true,
        loadingMes: '',
        sorters: {},
        pageIndex: -1,
        pageSize: -1,
        anonymous: false,
        successCallback: function (data) {
        },
        errorCallback: function (err) {
            Toast({
                message: err,
                duration: 2500
            });
            console.log(err);
        },
        finallyCallback: function (err) {
        },
    };
    option = _.extend(defOpt, option)
    if (option.needLoading) {
        showLoading(true, option.loadingMes);
    }
    var accessToken = getToken();

    if (!_.isEmpty(option.sorters)) {
        option.data['==REQ_SORTER=='] = option.sorters;
    }

    if (option.pageSize > 0 && option.pageIndex >= 0) {
        option.data['==REQ_PAGE=='] = {pageIndex: option.pageIndex, pageSize: option.pageSize};
    }
    let data = {
        portName: option.portName,
        requestData: JSON.stringify({
            data: {
                accessToken,
                ...option.data,
            }
        })
    }
    url = url || '/home/actionjson';
    let res = await post(url, data)
        .finally(() => {
                if (option.needLoading) {
                    showLoading(false);
                }
            }
        )


    try {
        if (res.status !== 200)
            throw '状态码' + res.status;
        if (res.data.success) {
            let respData = packRespData(res.data);
            if (option.successCallback) {
                option.successCallback(respData);
                return respData;
            }
        }
        // 判断 错误 是否为token相关
        // 如果是 调用 handleTokenError
        if (res.data.msg.indexOf('登录异常') !== -1) {
            handleTokenError();
            return;
        }
        throw res.data.msg;
    } catch (ex) {
        if (typeof option.errorCallback == 'function') {
            option.errorCallback(ex);
        }
    } finally {
        if (typeof option.finallyCallback == 'function') {
            option.finallyCallback();
        }
    }
}

//把一个对象的属性和值扩展另外对象的属性 sObj扩展的模板对象,可以为json字符串，tObj待扩展的目标对象
function extendObjAttr(sObj, tObj) {
    if (typeof tObj != 'object')
        return;
    if (typeof sObj == 'string') {
        if (sObj == '[]') {
            sObj = new Array();
        } else if (sObj == '') {
            sObj = {};
        } else {
            sObj = JSON.parse(sObj);
        }
    }
    Object.assign(tObj, sObj);
}

function packRespData(responseJsonData) {
    try {
        //合并额外参数
        extendObjAttr(responseJsonData.responseData, responseJsonData);
        delete responseJsonData.responseData;
        if (responseJsonData.data != null && responseJsonData.data != undefined) {
            //重新包装属性
            responseJsonData.entities = responseJsonData.data['==RESP_ENTITIES=='] === undefined ? [] : responseJsonData.data['==RESP_ENTITIES=='];
            responseJsonData.totalcount = responseJsonData.data['==RESP_TOTAL_COUNT=='];
            delete responseJsonData.data['==RESP_ENTITIES=='];
            delete responseJsonData.data['==RESP_TOTAL_COUNT=='];
        }
        return responseJsonData;
    } catch (e) {
        // server.checkCommuBroken();
        throw '包装服务器返回额外数据异常:' + e
    }
}

async function uploadFile(file) {
    const formData = new FormData()
    formData.append('file', file)
    let res = await post("/tool/upload", formData, {
        headers: {"Content-Type": "multipart/form-data"}
    })
    return parseData(res);
}

function base64ToFile(data) {
    // 将base64 的图片转换成file对象上传 atob将ascii码解析成binary数据
    let binary = atob(data.split(',')[1]);
    let mime = data.split(',')[0].match(/:(.*?);/)[1];
    let array = [];
    for (let i = 0; i < binary.length; i++) {
        array.push(binary.charCodeAt(i));
    }
    let fileData = new Blob([new Uint8Array(array)], {
        type: mime,
    });
    let file = new File([fileData], '${new Date().getTime()}.png', {type: mime});
    return file;
}

function getExtension(url) {
    if (_.isEmpty(url)) return '';
    url = url.substring(url.lastIndexOf("?"))
    var reg = new RegExp("(^|&)ext=([^&]*)(&|$)");
    var r = url.substr(1).match(reg);
    var extension = '';
    if (r != null) {
        extension = decodeURIComponent(r[2]).toLowerCase();
    }
    return extension;
}

function isImage(url) {
    var extension = getExtension(url);
    switch (extension) {
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'bmp':
        case 'gif':
        case 'ico':
            return true;
        default:
            return false;
    }
}

//imageConversion
function view() {
    const file = document.getElementById('demo').files[0];
    console.log(file);
    imageConversion.compressAccurately(file, 150).then(res => {
        //The res in the promise is a compressed Blob type (which can be treated as a File type) file;
        console.log(res);
    })
}

function cImg() {
    imageConversion.compressAccurately(file, {
        size: 100,    //The compressed image size is 100kb
        accuracy: 0.9,//the accuracy of image compression size,range 0.8-0.99,default 0.95;
                      //this means if the picture size is set to 1000Kb and the
                      //accuracy is 0.9, the image with the compression result
                      //of 900Kb-1100Kb is considered acceptable;
        type: "image/jpeg",
        width: 300,
        height: 200,
        orientation: 1,
        scale: 0.5,
    })
}

//压缩图片
function compressImg(file, fileSize, toJpg) {
    //质量0-1，数字越小，压缩后的文件文件越小
    return new Promise((resolve, reject) => {
        if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
            Toast('请上传 jpg/png格式图片');
            reject();
        } else {
            var size = isNaN(fileSize) ? 100 : fileSize;
            imageConversion.compressAccurately(file, {
                size: size,    //The compressed image size is 100kb
                accuracy: 0.9,//the accuracy of image compression size,range 0.8-0.99,default 0.95;
                              //this means if the picture size is set to 1000Kb and the
                              //accuracy is 0.9, the image with the compression result
                              //of 900Kb-1100Kb is considered acceptable;
                type: file.type,
                scale: 0.5,
            }).then(res => {
                //The res in the promise is a compressed Blob type (which can be treated as a File type) file;
                // Blob 转换为 File
                var name = file.name
                name = name.substring(0, name.lastIndexOf(".")) + '.jpg'
                if (toJpg) {
                    file = new window.File([res], name, {type: 'image/jpeg'});
                } else {
                    file = new window.File([res], file.name, {type: file.type});
                }
                resolve(file);
            });
        }
    });
}


// //压缩图片
// function compressImg(file, quality, toJpg) {
//     //质量0-1，数字越小，压缩后的文件文件越小
//     return new Promise((resolve, reject) => {
//         if (file.type !== 'image/jpeg' && file.type !== 'image/png' && file.type !== 'image/webp') {
//             Toast('请上传 jpg/png/webp 格式图片');
//             reject();
//         } else {
//             if (toJpg) {
//                 new Compressor(file, {
//                     quality: isNaN(quality) ? 0 : quality,
//                     convertTypes: ['image/png', 'image/webp'],
//                     convertSize: 1,
//                     width: 1080,
//                     resize: 'cover' ,
//                     success(result) {
//                         // Blob 转换为 File
//                         var name = file.name
//                         name = name.substring(0, name.lastIndexOf(".")) + '.jpg'
//                         file = new window.File([result], name, {type: 'image/jpeg'});
//                         resolve(file);
//                     },
//                     error(err) {
//                         console.log(err.message);
//                     },
//                 });
//             } else {
//                 new Compressor(file, {
//                     quality: isNaN(quality) ? 0 : quality,
//                     success(result) {
//                         // Blob 转换为 File
//                         file = new window.File([result], file.name, {type: file.type});
//                         resolve(file);
//                     },
//                     error(err) {
//                         console.log(err.message);
//                     },
//                 });
//             }
//         }
//     });
// }


function setUploadFileModel(file) {
    debugger
    file.status = "uploading";
    file.message = "上传中...";
    uploadFile(file.file)
        .then((data) => {
            file.status = "success";
            if (!_.isEmpty(data)) {
                _.forEach(data.filedata, function (e) {
                    var url = e.fileInfo.url;
                    file['content'] = null;
                    file['isImage'] = isImage(url);
                    file['url'] = baseUrl + url;
                    file['fileUrl'] = url;
                    file['fileID'] = e.fileInfo.relFilePath;
                    file['fileName'] = e.fileInfo.fileName;
                })
            }
        })
        .catch((err) => {
            file.status = "failed";
            file.message = "上传失败";
        });
}


function parseData(res) {
    if (res.status !== 200)
        throw new Error('状态码' + res.status);

    if (res.data.success) {
        let responseData = JSON.parse(res.data.responseData);
        return responseData.data;
    }
    throw new Error(res.data.msg);
}

function showLoading(show, message) {
    if (show) {
        Toast.loading({
            duration: 0, // 持续展示 toast
            forbidClick: true,
            message: message ? message : '加载中...',
        });
    } else {
        Toast.clear();
    }
}

function handleTokenError() {
    Toast.fail('登录状态异常');
    if (window.Capacitor) {
        Capacitor.Plugins.App.clearHistory();
    }
    router.push({path: '/login', query: {canback: false}});
}

export default {
    get baseUrl() {
        return baseUrl;
    },
    set baseUrl(value) {
        baseUrl = value;
        httpClient.defaults.baseURL = value;
    },
    login,
    loginByCode,
    register,
    post,
    get,
    uploadFile,
    callPort,
    setUploadFileModel,
    isLogin,
    storage,
    Cookie,
    getUserInfo,
    clearUserInfo,
    compressImg,
    base64ToFile,
    showLoading
}