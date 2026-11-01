declare namespace Matter {
 interface Body { position:{x:number;y:number};velocity:{x:number;y:number};speed:number }
 interface Engine { world:object }
 const Engine:{create(options:object):Engine;update(engine:Engine,dt:number):void;clear(engine:Engine):void};
 const Bodies:{circle(x:number,y:number,r:number,options:object):Body;rectangle(x:number,y:number,w:number,h:number,options:object):Body};
 const Body:{setVelocity(body:Body,velocity:{x:number;y:number}):void};
 const Composite:{add(world:object,bodies:Body[]):void;remove(world:object,body:Body):void;clear(world:object,keepStatic:boolean):void};
}
export default Matter;
