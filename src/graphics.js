  // Authored geometry and procedural textures. No third-party model downloads.
  // All additions are visual; simulation dimensions remain in core.js.
  function enhanceGraphics() {
    var detail = new T.Group(); world.add(detail);
    var pale = mat('#d2d2c5'), navy = mat('#183c47'), concrete = mat('#90938d');
    var frameMat = mat('#282d31'), metal = gloss('#c3cbd0', 95), brakeMat = lit('#861d18');
    var ink = mat('#263039'), blue = mat('#436875');

    // A small environment map supplies broad sky/ground reflections to metal and paint.
    var faces = [];
    for (var face = 0; face < 6; face++) {
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var g = c.getContext('2d'), grad = g.createLinearGradient(0,0,0,64);
      grad.addColorStop(0, '#c5e3f4'); grad.addColorStop(.48, '#e4e8df'); grad.addColorStop(.52, '#696e70'); grad.addColorStop(1, '#303335');
      g.fillStyle = face === 2 ? '#d1e7f4' : face === 3 ? '#474c50' : grad; g.fillRect(0,0,64,64);
      if (face < 2) { g.fillStyle = '#fff5dc'; g.fillRect(15,10,9,24); }
      faces.push(c);
    }
    var cube = new T.CubeTexture(faces); cube.encoding = T.sRGBEncoding; cube.needsUpdate = true;
    var pmrem = new T.PMREMGenerator(renderer), env = pmrem.fromCubemap(cube);
    world.environment = env.texture; cube.dispose(); pmrem.dispose();
    M.cab.roughness = .29; M.cab.metalness = .42;
    M.chrome.roughness = .2; M.chrome.metalness = .85;
    M.glass.color.copy(col('#223d4c')); M.glass.roughness = .12; M.glass.metalness = .55;
    M.ground.roughness = 1;

    function decal(parent, width, height, x, y, z, rotation, paint) {
      var texture = canvasTex(512,128,paint);
      texture.wrapS = texture.wrapT = T.ClampToEdgeWrapping;
      var material = new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false});
      var mesh = new T.Mesh(new T.PlaneGeometry(width,height),material);
      mesh.position.set(x,y,z); mesh.rotation.y = rotation; parent.add(mesh); return mesh;
    }
    function letters(text, background, color) {
      return function(g,w,h) {
        g.clearRect(0,0,w,h); if(background){g.fillStyle=background;g.fillRect(0,0,w,h);}
        g.fillStyle=color || '#e9eee5'; g.font='bold 65px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,w/2,h/2,w-24);
      };
    }
    function rod(parent, from, to, radius, material) {
      var a = new T.Vector3().fromArray(from), b = new T.Vector3().fromArray(to), direction = b.clone().sub(a);
      var mesh = new T.Mesh(new T.CylinderGeometry(radius,radius,direction.length(),8),material);
      mesh.position.copy(a.add(b).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());parent.add(mesh);return mesh;
    }

    // Cab details: sculpted roof fairing, metal trim, grille, windshield seals and wipers.
    prism(cabG, [[4.9,11.35],[5.8,12.7],[7.4,12.7],[9.6,10.5]],7.75,M.cab);
    bx(cabG,.09,3.15,.11,10.48,8.2,0,frameMat,false);
    [-1,1].forEach(function(side){
      var z=side*4.07;
      bx(cabG,4.8,.16,.06,7.5,6.3,z,metal,false);
      bx(cabG,4.8,.12,.06,7.5,3.45,z,pale,false);
      bx(cabG,2.4,.06,.08,8.65,9.65,z,metal,false);
      decal(cabG,2.6,.68,6.15,5.2,z*1.003,side===1?0:PI,letters('BC  /  01',null,'#e5d9aa'));
      for(var vent=0;vent<6;vent++) bx(trac,.13,.5,.04,11.2+vent*.3,4.8,side*3.34,frameMat,false);
      rod(cabG,[10.3,7,side*4],[10.6,7.6,side*4.95],.07,metal);
      rod(cabG,[9.7,9.2,side*4],[10.5,9.1,side*4.95],.06,metal);
      bx(cabG,.08,1.8,.55,10.54,8.2,side*4.9,M.glass,false);
      // Perforated step plates and fuel tank retaining bands.
      [6.5,7.7].forEach(function(x){bx(trac,.08,.08,1.1,x,1.18,side*3.7,metal,false);});
      [5.9,8.3].forEach(function(x){tube(trac,1.08,.12,x,2.25,side*3.23,M.steel,'x');});
      rod(cabG,[10.57,6.65,side*.2],[10.39,7.65,side*2.3],.045,frameMat);
    });
    for(var bar=0;bar<9;bar++) bx(trac,.04,.055,4.3,14.29,2.95+bar*.21,0,metal,false);
    decal(trac,1.7,.47,14.78,1.98,0,PI/2,letters('BC 001','#e8e5d5','#213b43'));
    // Tire tread, inset metal rims and a rotating hub indicator.
    wheels.forEach(function(wheel){
      var p=wheel.geometry.parameters;
      [-1,1].forEach(function(side){
        var rim=new T.Mesh(new T.CylinderGeometry(1.05,1.05,.07,16),metal);
        rim.position.y=side*(p.height/2+.025);wheel.add(rim);
        var hub=new T.Mesh(new T.CylinderGeometry(.38,.38,.14,12),M.steel);
        hub.position.y=side*(p.height/2+.1);wheel.add(hub);
        var tick=bx(wheel,.08,.025,.55,.65,side*(p.height/2+.07),0,M.steel,false);
      });
      for(var line=-1;line<=1;line++){
        var ring=new T.Mesh(new T.TorusGeometry(1.735,.023,3,20),frameMat);
        ring.rotation.x=PI/2;ring.position.y=line*p.height*.28;wheel.add(ring);
      }
    });
    // Trailer rails, cargo-door hardware and independent brake lights.
    [-1,1].forEach(function(side){
      bx(trl,35.7,.16,.1,-15,13.53,side*4.27,metal,false);
      bx(trl,35.7,.15,.1,-15,4.02,side*4.27,metal,false);
      for(var latch=0;latch<2;latch++){
        var z=side*(1+latch*2);
        rod(trl,[TL.r-.075,4.8,z],[TL.r-.075,12.7,z],.055,metal);
        bx(trl,.12,.1,.7,TL.r-.1,8.3,z,metal,false);
      }
      bx(trl,.09,.45,.72,TL.r-.1,3.1,side*2.9,brakeMat,false);
      for(var marker=0;marker<5;marker++) bx(trl,.3,.15,.07,TL.r+2+marker*7,4.7,side*4.29,M.amber,false);
      decal(trl,12,2.6,-14,10,side*4.29,side===1?0:PI,letters('BACKING COURSE',null,'#23444b'));
    });

    // Contact shading remains readable on phones at lower shadow-map resolution.
    var shadeTex=canvasTex(128,128,function(g,w,h){
      var grad=g.createRadialGradient(w/2,h/2,3,w/2,h/2,w/2);
      grad.addColorStop(0,'rgba(0,0,0,.42)');grad.addColorStop(.65,'rgba(0,0,0,.25)');grad.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=grad;g.fillRect(0,0,w,h);
    });
    var shadeMat=new T.MeshBasicMaterial({map:shadeTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    function contact(parent,l,x){var m=new T.Mesh(new T.PlaneGeometry(l,11),shadeMat);m.rotation.x=-PI/2;m.position.set(x,.085,0);parent.add(m);}
    contact(trac,19,6);contact(trl,39,-15);

    // Concrete apron, dock shelters and numbered loading bays. Scenery stays outside the driving area.
    bx(detail,9,.12,200,-4.8,.08,105,concrete,false);
    for(var bay=0;bay<9;bay++){
      var z=33+bay*18;
      bx(detail,.65,11.5,.75,.45,9.6,z-4.8,M.rubber);
      bx(detail,.65,11.5,.75,.45,9.6,z+4.8,M.rubber);
      bx(detail,.75,.9,10.3,.5,15.65,z,M.rubber);
      for(var slat=0;slat<9;slat++) bx(detail,.08,.08,8.7,.32,4.7+slat*1.2,z,metal,false);
      decal(detail,6,1.65,.92,18,z,PI/2,letters(String(bay+1).padStart(2,'0'),'#173c46','#f0d57d'));
      [-6,6].forEach(function(d){tube(detail,.22,4,.8,2,z+d,M.paint);});
      bx(detail,.5,1.2,.42,.55,8.7,z+5.7,M.steel,false);
      bx(detail,.52,.3,.25,.57,9,z+5.7,lit(bay%3?'#d84836':'#84c69b'),false);
    }
    decal(detail,80,9,.5,23,108,PI/2,letters('BACKING COURSE  /  FREIGHT TERMINAL','#173c46','#f4e4b9'));
    // Parking stalls and curbs beyond the practice pad.
    for(var stall=0;stall<7;stall++){
      stripe(detail,121,stall*20-10,181,stall*20-10,.3,.07,pale);
      bx(detail,1.1,.6,10,183,.3,stall*20-5,concrete,false);
    }
    stripe(detail,118,-10,118,135,.4,.07,pale);
    // Roadside signs, pallet stacks and roof equipment give scale at eye level.
    [[112,135,'TRAINING YARD'],[112,-18,'SLOW  /  5 MPH']].forEach(function(a){
      [a[0]-3,a[0]+3].forEach(function(x){tube(detail,.13,10,x,5,a[1],metal);});
      decal(detail,12,3,a[0],9,a[1],0,letters(a[2],'#173c46','#f4dc87'));
    });
    for(var stack=0;stack<3;stack++)for(var layer=0;layer<4;layer++){
      var x=114+stack*5,z=167;
      [0,1,2].forEach(function(n){bx(detail,4,.17,.55,x,layer*.65+.3,z+n*.9,mat('#9b8055'),false);});
    }
    [-32,-12].forEach(function(x){[45,110,165].forEach(function(z){bx(detail,9,3,7,x,27.5,z,metal);});});
    // Non-colliding pavement wear is deliberately subtle around the scored lane.
    var wear=canvasTex(256,256,function(g,w,h){
      g.clearRect(0,0,w,h);g.lineWidth=5;g.strokeStyle='rgba(15,18,20,.13)';
      for(var i=0;i<6;i++){g.beginPath();g.ellipse(w/2,h/2,60+i*7,110,.25,0,PI*2);g.stroke();}
    });
    var worn=new T.Mesh(new T.PlaneGeometry(45,55),new T.MeshBasicMaterial({map:wear,transparent:true,depthWrite:false}));
    worn.rotation.x=-PI/2;worn.position.set(130,.09,120);detail.add(worn);

    // Batch static boxes by material and shadow behavior. Live wheels remain independent.
    function batchBoxes(root, omit) {
      root.updateMatrixWorld(true);
      var groups={};
      root.traverse(function(m){
        if(!m.isMesh || m.geometry.type!=='BoxGeometry' || Array.isArray(m.material) || (omit && omit(m)))return;
        var key=m.material.id+'_'+m.castShadow, a=groups[key]||(groups[key]=[]);a.push(m);
      });
      Object.keys(groups).forEach(function(key){
        var items=groups[key];if(items.length<3)return;
        var geo=new T.BoxGeometry(1,1,1), mesh=new T.InstancedMesh(geo,items[0].material,items.length);
        var inverse=root.matrixWorld.clone().invert();
        items.forEach(function(m,i){
          var p=m.geometry.parameters, matrix=inverse.clone().multiply(m.matrixWorld).multiply(new T.Matrix4().makeScale(p.width,p.height,p.depth));
          mesh.setMatrixAt(i,matrix);m.parent.remove(m);m.geometry.dispose();
        });
        mesh.castShadow=items[0].castShadow;mesh.receiveShadow=true;mesh.frustumCulled=false;root.add(mesh);
      });
    }
    function belongs(m,root){while(m){if(m===root)return true;m=m.parent;}return false;}
    batchBoxes(world,function(m){return belongs(m,trac)||belongs(m,trl)||belongs(m,pathG)||belongs(m,levelG);});
    batchBoxes(cabG);
    // Only fixed tractor details; wheel decorations must continue rotating.
    batchBoxes(trac,function(m){return belongs(m,cabG)||wheels.some(function(w){return belongs(m,w);})||pivots.some(function(p){return belongs(m,p);});});
    batchBoxes(trl,function(m){return m===axleMark||wheels.some(function(w){return belongs(m,w);});});

    var lastV=0, pitch=0, samples=0, slow=0, stamp=0, settled=0, frameTotal=0;
    return {
      tick:function(dt){
        var acceleration=dt>0?(s.v-lastV)/dt:0;lastV=s.v;
        pitch+=(Math.max(-.012,Math.min(.012,-acceleration*.0015))-pitch)*Math.min(1,dt*8);
        cabG.rotation.z=pitch; // cosmetic suspension only, never changes the rig footprint
        var braking=finished||((!ptrDrive&&!keys.ArrowUp&&!keys.ArrowDown)&&Math.abs(s.v)>.05);
        brakeMat.color.copy(col(braking?'#ff3926':'#861d18'));
      },
      monitor:function(now,idle){
        if(idle){stamp=now;samples=0;slow=0;settled=0;return;}
        if(!stamp){stamp=now;return;}
        var ms=now-stamp;stamp=now;
        if(ms>250)return; // ignore tab transitions and debugger pauses
        if(settled<90){settled++;return;}
        samples++;frameTotal+=ms;if(ms>28)slow++;
        if(samples>=150){
          $('gl').dataset.fps=String(Math.round(1000*samples/frameTotal));
          $('gl').dataset.drawCalls=String(renderer.info.render.calls);
          $('gl').dataset.triangles=String(renderer.info.render.triangles);
          $('gl').dataset.renderScale=String(renderScale);
          frameTotal=0;
          if(slow>70&&renderScale>1){renderScale=1;fit();}
          else if(slow>100&&renderScale===1){renderScale=.85;fit();}
          samples=0;slow=0;
        }
      },
      dashboard:function(w,h,dpr){
        var y=h*.76, gradient=ctx.createLinearGradient(0,y,0,h);
        gradient.addColorStop(0,'#353b40');gradient.addColorStop(.12,'#242a2e');gradient.addColorStop(1,'#11171b');
        ctx.fillStyle=gradient;ctx.fillRect(0,y,w,h-y);
        ctx.strokeStyle='#747f83';ctx.lineWidth=1*dpr;ctx.beginPath();ctx.moveTo(0,y+3*dpr);ctx.lineTo(w,y+3*dpr);ctx.stroke();
        function dial(x,yy,r,f,label){
          ctx.fillStyle='#111b20';ctx.beginPath();ctx.arc(x,yy,r,0,PI*2);ctx.fill();ctx.strokeStyle='#7c898b';ctx.lineWidth=2*dpr;ctx.stroke();
          for(var t=0;t<9;t++){var a=PI*.8+t*PI*1.4/8;ctx.strokeStyle='#c3d3d0';ctx.lineWidth=dpr;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r*.7,yy+Math.sin(a)*r*.7);ctx.lineTo(x+Math.cos(a)*r*.87,yy+Math.sin(a)*r*.87);ctx.stroke();}
          var a=PI*.8+Math.min(1,f)*PI*1.4;ctx.strokeStyle='#f5c94f';ctx.lineWidth=2*dpr;ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+Math.cos(a)*r*.7,yy+Math.sin(a)*r*.7);ctx.stroke();
          ctx.fillStyle='#c5d5d1';ctx.font='600 '+Math.max(7,8*dpr)+'px sans-serif';ctx.textAlign='center';ctx.fillText(label,x,yy+r*.55);
        }
        var rad=Math.min(w*.058,h*.067);dial(w*.37,y+rad*1.3,rad,Math.abs(s.v)/10,'MPH');dial(w*.51,y+rad*1.3,rad,.16+Math.abs(s.v)/15,'RPM');
        ctx.fillStyle='#123b39';ctx.fillRect(w*.58,y+10*dpr,w*.13,h*.09);
        ctx.fillStyle='#a6e5bc';ctx.font='600 '+10*dpr+'px monospace';ctx.textAlign='center';ctx.fillText((Math.abs(s.v)*.681818).toFixed(1)+' MPH',w*.645,y+27*dpr);
        ctx.fillStyle='#10181c';for(var v=0;v<5;v++)ctx.fillRect(w*.08,y+(12+v*5)*dpr,w*.15,2*dpr);
      }
    };
  }
