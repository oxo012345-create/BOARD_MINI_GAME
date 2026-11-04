// Presentation only: commands are always sent in the server's world coordinates.
// In teams, rotate the allied column into the bottom row for either teammate.
export function battleView(mode, seat = 0) {
 const turns = mode === 'team' ? (seat % 2 ? 1 : 3) : [0, 2, 3, 1][seat] ?? 0;
 const [a,b,c,d,e,f] = [
  [1,0,0,1,0,0], [0,1,-1,0,1000,0],
  [-1,0,0,-1,1000,1000], [0,-1,1,0,0,1000],
 ][turns];
 return {
  turns, matrix: [a,b,c,d,e,f],
  x: (x,y) => a*x+c*y+e,
  y: (x,y) => b*x+d*y+f,
  toWorld: (x,y) => ({x:a*(x-e)+b*(y-f),y:c*(x-e)+d*(y-f)}),
 };
}
