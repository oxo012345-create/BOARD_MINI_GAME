const kb=value=>Number.isFinite(value)?(value/1024).toFixed(1)+'KB':'측정 중';
const ms=value=>Number.isFinite(value)?Math.round(value)+'ms':'측정 중';
export function connectionStatus(stats,{width,height,dpr}){
 if(!stats)return '온라인 대전에서 확인할 수 있습니다.';
 return [
  '연결: '+(stats.transport==='websocket-durable'?'실시간 서버':stats.transport==='https-d1'?'이전 HTTP 연결':stats.transport),
  '화면 그리기: '+(Number.isFinite(stats.drawFps)?stats.drawFps.toFixed(1)+' FPS':'측정 중'),
  '서버 왕복: '+ms(stats.rttMs?.mean),
  '명령 → 화면: '+ms(stats.commandToDrawMs?.mean),
  '상태 수신 간격: '+ms(stats.snapshotGapMs?.mean)+' / p95 '+ms(stats.snapshotGapMs?.p95),
  ...(stats.health?[
   '화면 멈춤 ≥100ms: '+stats.health.frame.count+'회 · 최대 '+ms(stats.health.frame.maxMs),
   '상태 수신 공백 ≥200ms: '+stats.health.state.count+'회 · 최대 '+ms(stats.health.state.maxMs),
   '복귀: '+stats.health.recoveries+'회 · 최근 '+ms(stats.health.lastRecoveryMs)+' · 재연결 '+stats.health.reconnects+'회',
  ]:[]),
  ...(stats.traffic?[
   '동기화: 재요청 '+(stats.traffic.resyncRequests||0)+'회 · 오류 '+(stats.protocolErrors||0)+'회',
   '앱 데이터: 수신 '+kb(stats.traffic.receivedBytes)+' / 송신 '+kb(stats.traffic.sentBytes),
   '상태 확인: '+stats.traffic.stateAcks+'회 · 함께 전송 '+stats.traffic.piggybackAcks+'회 · '+(stats.ackMode==='pairs'?'최대2개 묶음':'지연 보호 · 즉시'),
  ]:[]),
  '마지막 수신: '+(Number.isFinite(stats.staleMs)?(stats.staleMs/1000).toFixed(2)+'초 전':'측정 중'),
  `화면: ${width}×${height}, DPR ${dpr}`,
  '화면 개선판: 2026-11-05a',
 ].join('\n');
}
