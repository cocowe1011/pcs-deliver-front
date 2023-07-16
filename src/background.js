import { app, BrowserWindow, globalShortcut, ipcMain, Menu, dialog, Tray, screen } from 'electron';
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib';
import nodes7 from 'nodes7';
import HttpUtil from '@/utils/HttpUtil'
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
var appTray = null;
let closeStatus = false;
var conn = new nodes7;
// electron 开启热更新
try {
  require('electron-reloader')(module,{});
} catch (_) {}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

global.sharedObject = {
  cookieStr: '',
  deptInfo: {}
}
let mainWindow = null;
app.on('ready', () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 600,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false
    },
    icon: './build/icons/icon.ico'
  });
  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    mainWindow.loadURL(process.env.WEBPACK_DEV_SERVER_URL);
    if (!process.env.IS_TEST) mainWindow.webContents.openDevTools();
  } else {
    createProtocol('app');
    // Load the index.html when not in development
    mainWindow.loadURL('app://./index.html');
    // mainWindow.webContents.openDevTools();
  }
  ipcMain.on('logStatus', (event, arg) => {
    console.log(arg)
    if(arg === 'login') {
      mainWindow.setResizable(true)
      mainWindow.setBounds({ x: 0, y: 0, width: screen.getPrimaryDisplay().workAreaSize.width, height: screen.getPrimaryDisplay().workAreaSize.height });
    } else {
      // 太几把坑了，windows系统setSize center方法失效 必须先mainWindow.unmaximize()
      mainWindow.unmaximize()
      mainWindow.setSize(1100, 600);
      mainWindow.center();
      mainWindow.webContents.executeJavaScript(`
        (function(){ 
          window.sessionStorage.removeItem('userInfo')
        })()
      `)
      // mainWindow.setResizable(false)
    }
  })
  // 定义自定义事件
  ipcMain.on('close-window', function() {
    mainWindow.close();
  })
  // 定义自定义事件
  ipcMain.on('min-window', (event, arg) => {
    mainWindow.minimize();
  })
  // writeValuesToPLC
  ipcMain.on('writeValuesToPLC', (event, arg1, arg2) => {
    writeValuesToPLC(arg1, arg2);
  })
  // 定义自定义事件
  ipcMain.on('max-window', (event, arg) => {
    if (arg === 'max-window') {
      return mainWindow.maximize()
    }
    mainWindow.unmaximize()
    mainWindow.setBounds({ x: 10, y: 10, width: screen.getPrimaryDisplay().workAreaSize.width - 20, height: screen.getPrimaryDisplay().workAreaSize.height - 20 });
  })
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('mainWin-max', 'max-window')
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('mainWin-max', 'unmax-window')
  })
  mainWindow.on('close', (e) => {
    closeStatus = true;
    e.preventDefault(); //先阻止一下默认行为，不然直接关了，提示框只会闪一下
    dialog.showMessageBox({
      type: 'warning',
      title: '提醒！',
      message:'确认关闭程序吗？',
      buttons: ['关闭程序', '放入托盘','取消'],   //选择按钮，点击确认则下面的idx为0，取消为1
      cancelId: 2, //这个的值是如果直接把提示框×掉返回的值，这里设置成和“取消”按钮一样的值，下面的idx也会是1
    }).then(idx => {
      if (idx.response == 2) {
        e.preventDefault();
      } else if(idx.response == 0) {
        mainWindow = null
        app.exit();
      }else{
        mainWindow.setSkipTaskbar(true);
        mainWindow.hide();
      }
    })
  });
  setAppTray();
  // 开发者工具
  globalShortcut.register('CommandOrControl+L', () => {
    mainWindow.webContents.openDevTools()
  })
  globalShortcut.register('CommandOrControl+F11', () => {
    mainWindow.isFullScreen() ? mainWindow.setFullScreen(false) : mainWindow.setFullScreen(true);
  })
  // 定义自定义事件
  ipcMain.on('full_screen', function() {
    mainWindow.isFullScreen() ? mainWindow.setFullScreen(false) : mainWindow.setFullScreen(true);
  })
  // setUserInfo
  ipcMain.on('setUserInfo', (event, arg) => {
    mainWindow.webContents.executeJavaScript(`
      (function(){ 
        window.sessionStorage.setItem("userInfo", '${JSON.stringify(arg)}')
      })()
    `)
  })
  // 程序启动时判断是否存在报表、日志等本地文件夹，没有就创建
  createFile('batchReport.grf');
  createFile('boxreport.grf');
  // 创建存放临时pdf的文件夹 d:\\pcs_temp_data\report\temp\
  if (!fs.existsSync('D://pcs_temp_data/report/temp')) {
    try {
      fs.mkdirSync('D://pcs_temp_data/report/temp', { recursive: true });
      console.log('temp目标文件夹已成功创建');
    } catch (err) {
      console.error('temp创建目标文件夹时出现错误：', err);
      return;
    }
  }
});

function createFile(fileNameVal) {
  const sourcePath = path.join(__static, './report', fileNameVal);// 要复制的文件的路径=
  const destinationPath = 'D://pcs_temp_data/report'; // 目标文件夹的路径

  // 检查源文件是否存在
  if (!fs.existsSync(sourcePath)) {
    console.error('源文件不存在');
    return;
  }

  // 获取源文件的文件名
  const fileName = path.basename(sourcePath);

  // 构建目标文件的完整路径
  const destinationFilePath = path.join(destinationPath, fileName);

  // 检查目标文件夹是否存在，如果不存在则创建它
  if (!fs.existsSync(destinationPath)) {
    try {
      fs.mkdirSync(destinationPath, { recursive: true });
      console.log('目标文件夹已成功创建');
    } catch (err) {
      console.error('创建目标文件夹时出现错误：', err);
      return;
    }
  }

  // 检查目标文件是否已经存在
  if (fs.existsSync(destinationFilePath)) {
    console.log('目标文件已存在，跳过复制操作');
  } else {
    try {
      // 使用流的方式复制文件
      fs.copyFileSync(sourcePath, destinationFilePath);
      console.log('文件已成功复制到目标文件夹');
    } catch (err) {
      console.error('文件复制过程中出现错误：', err);
    }
  }
}

var variables = {
  DBW2: 'DB101,INT2', // 加速器设定输送线速度
  DBW4: 'DB101,INT4', // 加速器允许货物进入辐照区
  DBW6: 'DB101,INT6', // 暂停按钮
  DBW8: 'DB101,INT8', // 启动输送线
  DBW10: 'DB101,INT10', // 停止输送线
  DBW12: 'DB101,INT12', // 翻转模式
  DBW14: 'DB101,INT14', // 回流模式
  DBW16: 'DB101,INT16', // 下货
  DBW18: 'DB101,INT18', // 剔除指令
  DBW20: 'DB101,INT20', // 单独启动105
  DBW22: 'DB101,INT22', // 纸箱宽度
  DBW24: 'DB101,INT24', // 纸箱长度
  DBW26: 'DB101,INT26', // 不允许上货
  DBW34: 'DB101,INT34', // 扫码信息不一致报警
  DBW36: 'DB101,INT36', // 允许上货
  DBW60: 'DB101,INT60', // 看门狗心跳
  DBW62: 'DB101,INT62',
  DBW64: 'DB101,INT64',
  DBW66: 'DB101,INT66', // 故障信息
  DBW68: 'DB101,INT68',
  DBW70: 'DB101,INT70',
  DBW72: 'DB101,INT72',
  DBW76: 'DB101,INT76', // 束下前输送速度比
  DBB100: 'DB101,C100.30',
  DBB130: 'DB101,C130.30'
};

// 给PLC写值
function writeValuesToPLC(add, values) {
  // console.log(add)
  // console.log(values)
  // nodes7 代码
  conn.writeItems(add, values, valuesWritten); // This writes a single boolean item (one bit) to true
  // console.log(add +','+values)
}

function valuesWritten(anythingBad) {
  if (anythingBad) { console.log("SOMETHING WENT WRONG WRITING VALUES!!!!"); }
}

function valuesReady(anythingBad, values) {
  if (anythingBad) { console.log("SOMETHING WENT WRONG READING VALUES!!!!"); }
  console.log(values)
  mainWindow.webContents.send('receivedMsg', values)
}

const setAppTray = () => {  
  // 系统托盘右键菜单
  var trayMenuTemplate = [
      {
          label: '退出',
          click: function() {
              app.quit()
          }
      }
  ]

  console.log()
  // 系统托盘图标目录
  appTray = new Tray(path.join(__static, './icon.ico'))

  // 图标的上下文菜单
  const contextMenu = Menu.buildFromTemplate(trayMenuTemplate)

  // 设置此托盘图标的悬停提示内容
  appTray.setToolTip('全自动束下输送系统(pcs)')

  // 设置此图标的上下文菜单
  appTray.setContextMenu(contextMenu)

  appTray.on("click", function(){
    //主窗口显示隐藏切换
    if(mainWindow.isVisible()){
      mainWindow.hide();
      mainWindow.setSkipTaskbar(true);
    }else{
      mainWindow.show();
      mainWindow.setSkipTaskbar(false);
    }
  })
}
