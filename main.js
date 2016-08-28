function initTerm(){
  var terminal = document.getElementById("terminal");
  terminal.onfocus = function(){
    document.getElementById('cursor').style.display = 'inline-block';
  };
  terminal.onblur = function(){
    document.getElementById('cursor').style.display = 'none';
  };
  var current = terminal.children[terminal.children.length-1];
  var buffer = "";
  var newLine = function(){
    current.innerHTML = "<div class=\"inner\">" + buffer.replace(/  /g,' &#160;').replace(/&#160; /g,'&#160;&#160;') + "</div>";
    current = document.createElement('div');
    current.class = 'line';
    buffer = '';
    writeBuffer();
    terminal.appendChild(current);
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
  var toHex = function(val){
    var map = '0123456789abcdef';
    return map[(val/16)|0]+map[val % 16];
  };
  for(let i = 0; i < table.rows.length;i++){
    table.rows[i].cells[0].innerHTML = "0x" + i.toString(16) + '0:';
    for(let k = 0; k < 8;k++){
      table.rows[i].cells[k+1].innerHTML = toHex(memory[i*16+k*2])+toHex(memory[i*16+k*2+1]);
    }
  }
  var setMem = function(ptr,val){
    if(memory[ptr] === val){
      animCell(ptr);
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
      cell.innerHTML = toHex(memory[row*16+offset*2])+toHex(memory[row*16+offset*2+1]);
    }
    cell.style.animation='none';
    setTimeout(()=>cell.style.animation='blink .1s',0);
  };
  return function(ptr,val){
    if(val !== undefined){
      setMem(ptr,val);
    }else{
      animCell(ptr);
      return memory[ptr];
    }
  };
}
function initCPU(term,mem){
  var table = document.getElementById("inspector").children[0];
  var memory = [];
  memory.length = 16*table.rows.length; memory.fill(0); //fill memory with 16*20 0's
  var i = 0,stdin, buffer;
  var Q = function(f,...args){ //wraps and binds args
    return new Promise(res=>f(...args,res));
  };
  var printStr = function(ptr,callback){
    var val = mem(ptr);
    if(val!==0){
      term(String.fromCharCode(val));
      wait(200).then(printStr.bind(null,ptr+1,callback));
    }else{
      callback();
    }
  };
  var cmpStr = function(ptr,ptr2,callback){
    console.log('comapring ', ptr, 'to',ptr2);
    var val = mem(ptr), val2 = mem(ptr2);
    if(val === val2){
      if(val === 0){
        wait(200).then(callback.bind(null,true));
      }else{
        wait(200).then(cmpStr.bind(null,ptr+1,ptr2+1,callback));
      }
    }else{
      wait(200).then(callback.bind(null,false));
    }
  };
  var loadStr = function(ptr,buffer,i,callback){
    if(buffer[i]){
      console.log('reading from const buffer',buffer[i]);
      if(buffer[i] == '\t'){
        console.log('should end');
        mem(ptr,0);
        i++;
        wait(200).then(callback);
      }else{
        mem(ptr,buffer.charCodeAt(i));
        i++;
        wait(200).then(loadStr.bind(null,ptr+1,buffer,i,callback));
      }
    }
  };
    var loadUser = function(ptr,callback){
    if(buffer[i]){
      console.log('reading from buffer',buffer[i],i);
      term(buffer[i]);
      if(buffer[i] == '\n'){
        mem(ptr,0);
        i++;
        wait(200).then(callback);
      }else{
        mem(ptr,buffer.charCodeAt(i));
        i++;
        wait(200).then(loadUser.bind(null,ptr+1,callback));
      }
    }else{
      console.log('setting up callback');
      status = 'waiting';
      stdin = function(k){
        console.log('received ',k)
        term(k);
        if(k == '\n'){
          mem(ptr,0);
          wait(200).then(callback);
        }else{
          mem(ptr,k.charCodeAt(0));
          wait(200).then(loadUser.bind(null,ptr+1,callback));
        }
      };
    }
  };
  var wait = time=>new Promise(resolve=>setTimeout(resolve,time));
  
  var init = function(){
    loop = function(){
            Q(printStr,0).then(function(){
              buffer = ''; i = 0;
              Q(loadUser,43).then(()=>Q(cmpStr,31,43)).then(function(success){
                    if(success){
                      printStr(11,()=>0)
                    }else{
                      printStr(21,loop)
                    }
                  });
              });
            };
    Promise.all([Q(loadStr,0,'Password: \t',0),
                 Q(loadStr,11,'Success!\n\t',0),
                 Q(loadStr,21,'Failure!\n\t',0),
                 Q(loadStr,31,'Hello World\t',0)]).then(loop);
  };
  init();
  return function(val){
    console.log(status)
    if(status === 'waiting'){
      status = 'running';
      setTimeout(stdin.bind(null,val),0);
    }else{
      buffer += val;
    }
  };
}
function initInput(input){
  var keys = {};
  document.onkeydown = function(e){
    if(document.activeElement.id === "terminal"){
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
var input = initCPU(term,mem);
initInput(input);

