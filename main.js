function initTerm(){
  var terminal = document.getElementById("terminal");
  var current = terminal.children[terminal.children.length-1];
  var buffer = "";
  var newLine = function(){
    current.innerHTML = "<div class=\"inner\">" + buffer.replace(/  /g,' &#160;').replace(/&#160; /g,'&#160;&#160;') + "</div>";
    current = document.createElement('div');
    current.className = 'line';
    buffer = '';
    writeBuffer();
    terminal.appendChild(current);
    terminal.scrollTop = terminal.scrollHeight;
  };
  var writeBuffer = function(){
    current.innerHTML = "<div class=\"inner\">" + buffer.replace(/  /g,' &#160;').replace(/&#160; /g,'&#160;&#160;') + "<div id=\"cursor\"></div></div>";
  };
  var writeLine = function(str,color){
    if(str.includes('\n')){
      let lines = str.split('\n');
      writeLine(lines.shift(),color);
      for(let line of lines) {
        newLine();
        writeLine(line,color);
      }
    }else{
      buffer += (!color)?str:("<div style=color:"+color+";display:inline-block>"+str+"</div>");
      writeBuffer();
    }
  };
  return writeLine;
}
function initMem(){
  var inspector = document.getElementById("inspector");
  var table = inspector.children[0];
  var memory = [];
  memory.length = 16*table.rows.length; memory.fill(0); //fill memory with 16*20 0's
  var toHex = function(ptr){
    if(memory[ptr] < 0){
      return 'XX';
    }
    var val = memory[ptr];
    var map = '0123456789abcdef';
    return map[(val/16)|0]+map[val % 16];
  };
  var loadMem = function(mem){
    for(let i = 0; i < mem.length;i++){
      memory[i] = mem[i];
    }
    for(let i = 0; i < table.rows.length;i++){
      table.rows[i].cells[0].innerHTML = "0x" + i.toString(16) + '0:';
      for(let k = 0; k < 8;k++){
        table.rows[i].cells[k+1].innerHTML = toHex(i*16+k*2)+toHex(i*16+k*2+1);
      }
    }
  };
  loadMem([]);
  
  var getM = function(ptr){
    if(memory[ptr] < 0){
      return memory[ptr]+300;
    }else{
      return memory[ptr];
    }
  };
  var setMem = function(ptr,val){
    if(memory[ptr] === val){
      animCell(ptr);
    }else if(memory[ptr] < 0 && val >= 0){
      memory[ptr] = val-300;
      animCell(ptr,true);
    }else{
      memory[ptr] = val;
      animCell(ptr,true);
    }
  };
  var animCell = function(ptr,write){
    var offset = ptr % 16;
    var row = (ptr - offset) / 16;
    offset = (offset/2)|0; //there are half as many cells as bytes because of 4 hex width cells
    var cell = table.rows[row].cells[offset+1]; //account for address column
    if(write){
      cell.innerHTML = toHex(row*16+offset*2)+toHex(row*16+offset*2+1);
    }
    cell.style.animation='none';
    setTimeout(()=>cell.style.animation='blink .1s',0);
  };
  var wait = time=>new Promise(resolve=>setTimeout(resolve,time));
  var out = function(ptr,val,protect){
    //console.log(memory);
    if(val !== undefined){
      setMem(ptr,val+(protect?-300:0));
      return wait(200);
    }else{
      animCell(ptr);
      return wait(200).then(()=>getM(ptr));
    }
  };
  out.reset = loadMem;
  return out;
}

var Q = function(f,...args){ //wraps and bind
  return new Promise(res=>f(...args,res));
};
  
function initCPU(term,mem,code,success){
  var printStr = function(ptr,callback){
    mem(ptr).then(function(val){
      if(val!==0){
        term(String.fromCharCode(val));
        printStr(ptr+1,callback);
      }else{
        callback();
      }
    });
  };
  var cmpStr = function(ptr,ptr2,callback){
    console.log('comaparing ', ptr, 'to',ptr2);
    Promise.all([mem(ptr), mem(ptr2)]).then(function(arr){
      if(arr[0] === arr[1]){
        if(arr[0] === 0){
          callback(true);
        }else{
          cmpStr(ptr+1,ptr2+1,callback);
        }
      }else{
        callback(false);
      }
    });
  };
  var loadStr = function(ptr,buffer,i,callback){
    if(buffer[i]){
      console.log('reading from const buffer',buffer[i]);
      if(buffer[i] == '\t'){
        mem(ptr,0).then(function(){
          i++;
          callback();
        });
      }else{
        mem(ptr,buffer.charCodeAt(i)).then(function(){
          i++;
          loadStr(ptr+1,buffer,i,callback);
        });
      }
    }
  };
  var loadUser = function(ptr,callback){
    if(state.buffer[state.i]){
      console.log('reading from buffer',state.buffer[state.i],state.i);
      term(state.buffer[state.i]);
      if(state.buffer[state.i] == '\n'){
        mem(ptr,0).then(function(){
          state.i++;
          callback();
        });
      }else{
        mem(ptr,state.buffer.charCodeAt(state.i)).then(function(){
          state.i++;
          loadUser(ptr+1,callback);
        });
      }
    }else{
      console.log('setting up callback');
      state.status = 'waiting';
      state.stdin = function(k){
        console.log('received ',k)
        term(k);
        if(k == '\n'){
          console.log('ending')
          mem(ptr,0).then(callback);
        }else{
          mem(ptr,k.charCodeAt(0)).then(loadUser.bind(null,ptr+1,callback));
        }
      };
    }
  };
  var rndPass = function(ptr,length,callback){
    if(length == 1){
      mem(ptr,0,true).then(function(){
        callback();
      });
    }else{
      mem(ptr,"abcdefghijklmnopqrstuvwxyxz".charCodeAt((Math.random()*26)|0),true).then(function(){
        rndPass(ptr+1,length-1,callback);
      });
    }
  };

  var state = {loadUser:loadUser,loadStr:loadStr,cmpStr:cmpStr,printStr:printStr,rndPass:rndPass,i:0,buffer:'',stdin:()=>0,success:success};
  code(state);
  return function(val){
    console.log(state.status)
    if(state.status === 'waiting'){
      state.status = 'running';
      setTimeout(state.stdin.bind(null,val),0);
    }else{
      state.buffer += val;
    }
  };
}
function initInput(input){
  var keys = {};
  document.onkeydown = function(e){
    if(document.activeElement.id === "terminal"){
      if(e.key === ' '){
        e.preventDefault();
      }
      if(!keys[e.key]){
        if(e.key === 'Enter'){
          input('\n');
        }else if(e.key === 'Tab'){
          input('\t');
        }else if(e.key.length === 1){
          //console.log(e.key)
          input(e.key);
        }
      }
      keys[e.key] = true;
    }
  };
  document.onkeyup = function(e){
    keys[e.key] = false;
  };
}

var term = initTerm();
var mem = initMem();

var levels = [{mem:[80, 97, 115, 115, 119, 111, 114, 100, 58, 32, 0, 83, 117, 99, 99, 101, 115, 115, 33, 10,
       0, 70, 97, 105, 108, 117, 114, 101, 33, 10, 0, 72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100],
              description:"Use the memory inspector to the right to discover the password\n",
              code: function(state){
                console.log('error')
                loop = function(){
                        Q(state.printStr,0).then(function(){
                          state.buffer = ''; state.i = 0;
                          Q(state.loadUser,43).then(()=>Q(state.cmpStr,31,43)).then(function(success){
                                if(success){
                                  state.printStr(11,state.success)
                                }else{
                                  state.printStr(21,loop)
                                }
                              });
                          });
                        };
                loop();
                /*Promise.all([Q(loadStr,0,'Password: \t',0),
                             Q(loadStr,11,'Success!\n\t',0),
                             Q(loadStr,21,'Failure!\n\t',0),
                             Q(loadStr,31,'Hello World\t',0)]).then(loop);*/
              }},{mem:[80, 97, 115, 115, 119, 111, 114, 100, 58, 32, 0, 83, 117, 99, 99, 101, 115, 115, 33, 10, 0, 70, 97, 105, 108, 117, 114, 101, 33, 10,
              0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,0],
              description:"Memory covered by XX's is protected and it cannot be intercepted by the memory inspector\n",
              code: function(state){
                loop = function(){
                        Q(state.printStr,0).then(function(){
                          state.buffer = ''; state.i = 0;
                          Q(state.loadUser,31).then(()=>Q(state.cmpStr,31,46)).then(function(success){
                                if(success){
                                  state.printStr(11,state.success)
                                }else{
                                  state.printStr(21,loop)
                                }
                              });
                          });
                        };
                //loop();
                state.rndPass(46,10,loop);
                /*Promise.all([Q(state.loadStr,0,'Password: \t',0),
                             Q(state.loadStr,11,'Success!\n\t',0),
                             Q(state.loadStr,21,'Failure!\n\t',0),
                             Q(state.loadStr,45,'Hello World\t',0)]).then(loop);*/
              }},{mem:[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,0],
              description:"End of the game; come back for more later or check <a href=\"https://github.com/thethirdone/hacking-game\">Github</a> to look at the source\n",
              code: function(state){}}
              
              ];

var loadLevel = function(i){
  return function(){
    term("Level "+i+":\n");
    term(levels[i].description);
    mem.reset(levels[i].mem);
    initInput(initCPU(term,mem,levels[i].code,loadLevel(i+1)));
  }
}
//var input = initCPU(term,mem,levels[0].code,loadLevel(1));
//initInput(input);
loadLevel(0)();