const ms=value=>Number.isFinite(value)?Math.round(value)+'ms':'측정 중';
export function connectionStatus(stats,{width,height,dpr}){
 if(!stats)return '온라인 대전에서 확인할 수 있습니다.';
 return [
  '연결: '+(stats.transport==='websocket-durable'?'실시간 서버':stats.transport==='https-d1'?'이전 HTTP 연결':stats.transport),
  '화면 그리기: '+(Number.isFinite(stats.drawFps)?stats.drawFps.toFixed(1)+' FPS':'측정 중'),
  '서버 왕복: '+ms(stats.rttMs?.mean),
  '명령 → 화면: '+ms(stats.commandToDrawMs?.mean),
  '상태 수신 간격: '+ms(stats.snapshotGapMs?.mean)+' / p95 '+ms(stats.snapshotGapMs?.p95),
  '마지막 수신: '+(Number.isFinite(stats.staleMs)?(stats.staleMs/1000).toFixed(2)+'초 전':'측정 중'),
  `화면: ${width}×${height}, DPR ${dpr}`,
  '화면 개선판: 2026-11-04b',
 ].join('\n');
}
