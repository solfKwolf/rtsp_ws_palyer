// 格式如下：
// WSP/1.1 GET_INFO
// proto: rtsp
// host: localhost
// port: 8554
// client: 
// seq: 1

class wspParse {
  constructor(data) {
    var payIdx = data.indexOf("\r\n\r\n");
    var lines = data.substr(0, payIdx).split("\r\n");
    var hdr = lines.shift().match(new RegExp("WSP/1.1\\s+(.+)"));
    this.msg = hdr[1];
    this.data = {};
    this.payload = ""
    if (hdr) {
      while (lines.length) {
        var line = lines.shift();
        if (line) {
          var subD = line.split(":");
          this.data[subD[0]] = subD[1].trim();
        } else {
          break;
        }
      }
      this.payload = data.substr(payIdx + 4);
    }
  }
}

export default wspParse
