/**
 * 2022/04/01
 * author: liuzongjie
 */
import net from "node:net";
import { WebSocketServer } from "ws";
import wspParse from "./lib/wspParse.js";
import { _ip2int } from "./lib/utils.js"

const wss = new WebSocketServer({ port: 1104 });

var channelIndex = 1;

function wss_handle_close(conn) {
  console.log("close", conn);
}

function wss_handle_error(conn) {
  console.log("error", conn);
}

wss.on("close", wss_handle_close);
wss.on("error", wss_handle_error);

var channelsocket = {};

wss.on("connection", function (conn) {
  console.log("protocol", conn.protocol);
  var protocol = conn.protocol;
  if (protocol == "control") {
    conn.onmessage = function (msg) {
      console.log(msg.data);
      var res = new wspParse(msg.data);
      if (res.msg == "INIT") {
        var ipIndex = _ip2int(res.data.host);

        var channel = channelIndex++;
        conn.channel = channel;
        InitChannel(
          channel,
          ipIndex,
          res.data.host,
          res.data.port,
          function () {
            var msg = wspMsg("200", "INIT OK", res.data.seq, {
              channel: channel,
            });
            conn.send(msg);
          },
          function (msgFail) {
            var msg = wspMsg("501", msgFail, res.data.seq);
            conn.send(msg);
          }
        );
      } else if (res.msg == "WRAP") {
        //console.log(res.payload);
        if (channelsocket[conn.channel]) {
          channelsocket[conn.channel].outControlData = true;
          channelsocket[conn.channel].once("data", function (data) {
            console.log(data.toString("utf8"));
            var msg = wspMsg(
              "200",
              "WRAP OK",
              res.data.seq,
              { channel: conn.channel },
              data
            );
            conn.send(msg);
          });
          channelsocket[conn.channel].write(res.payload);
        }
      }
    };
  } else if (protocol == "data") {
    //建立pipe
    conn.onmessage = function (msg) {
      console.log(msg.data);
      var res = new wspParse(msg.data);
      if (res.msg == "JOIN") {
        channelsocket[res.data.channel].on("rtpData", function (data) {
          //    console.log(data);
          conn.send(data);
        });

        var msg = wspMsg("200", "JOIN OK", res.data.seq);
        conn.send(msg);
      }
    };
  }
});

// 创建RTSP代理
function InitChannel(channel, ipIndex, ip, prt, okFunc, failFunc) {
  var sock = net
    .connect({ host: ip, port: prt }, function () {
      channelsocket[channel] = sock;
      okFunc();
      sock.connectInfo = true;

      sock.rtpBuffer = Buffer.alloc(2048);
      sock.on("data", function (data) {
        if (sock.outControlData) {
          sock.outControlData = false;
          return;
        }

        var flag = 0;
        // TCP截断
        if (sock.SubBuffer && sock.SubBufferLen > 0) {
          // 缺少的buff长度
          flag = sock.SubBuffer.length - sock.SubBufferLen;
          data.copy(sock.SubBuffer, sock.SubBufferLen, 0, flag);
          sock.emit("rtpData", sock.SubBuffer);

          sock.SubBufferLen = 0;
        }

        while (flag < data.length) {
          // 获取 RTSP data length
          var len = data.readUIntBE(flag + 2, 2);
          // 获取RTSP帧的二进制数据
          sock.SubBuffer = Buffer.alloc(4 + len);
          // 处理TCP粘包  
          if (flag + 4 + len <= data.length) {
            data.copy(sock.SubBuffer, 0, flag, flag + len + 4);
            sock.emit("rtpData", sock.SubBuffer);
            sock.SubBufferLen = 0;
          } else {
            data.copy(sock.SubBuffer, 0, flag, data.length);
            sock.SubBufferLen = data.length - flag;
          }
          flag += 4;
          flag += len;
        }
      });
    })
    .on("error", function (e) {
      //clean all client;
      console.log(e);
    });
  sock.setTimeout(1000 * 3, function () {
    if (!sock.connectInfo) {
      console.log("time out");
      failFunc("relink host[" + ip + "] time out");
      sock.destroy();
    }
  });

  sock.on("close", function (code) {
    //关闭所有子项目
  });
}

function wspMsg(code, msg, seq, data, play) {
  var msg = "WSP/1.1 " + code + " " + msg + "\r\n";
  msg += "seq:" + seq;
  if (data) {
    for (var i in data) {
      msg += "\r\n";
      msg += i.toString() + ":" + data[i].toString();
    }
  }
  msg += "\r\n\r\n";
  if (play) msg += play;

  return msg;
}
