function formatPosterTime(timestamp) {
  return new Date(timestamp || Date.now()).toLocaleString('zh-CN');
}

export function buildWinnerPosterModel(activity, queryResult) {
  const title = activity?.settings?.title || activity?.name || '年会抽奖';
  const participant = queryResult.participant || queryResult.records?.[0]?.participant || {};

  return {
    title,
    winnerName: participant.name || '获奖嘉宾',
    department: participant.department || '幸运得主',
    time: formatPosterTime(queryResult.records?.[0]?.timestamp),
    prizes: (queryResult.records || []).map(record => ({
      level: record.prizeLevel,
      name: record.prizeName,
    })),
  };
}

export function renderWinnerPoster(canvas, model) {
  const ctx = canvas.getContext('2d');
  canvas.width = 1080;
  canvas.height = 1920;

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#0c0c0e');
  gradient.addColorStop(0.6, '#15161a');
  gradient.addColorStop(1, '#312816');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(201, 168, 76, 0.12)';
  ctx.beginPath();
  ctx.arc(860, 260, 220, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(201, 168, 76, 0.35)';
  ctx.lineWidth = 4;
  ctx.strokeRect(72, 72, canvas.width - 144, canvas.height - 144);

  ctx.fillStyle = '#c9a84c';
  ctx.font = 'bold 62px "Microsoft YaHei", sans-serif';
  ctx.fillText(model.title, 112, 220);

  ctx.fillStyle = '#f5f5f7';
  ctx.font = 'bold 120px "Microsoft YaHei", sans-serif';
  ctx.fillText(model.winnerName, 112, 420);

  ctx.fillStyle = '#86868b';
  ctx.font = '42px "Microsoft YaHei", sans-serif';
  ctx.fillText(model.department, 112, 500);
  ctx.fillText(`开奖时间：${model.time}`, 112, 570);

  ctx.fillStyle = '#f5f5f7';
  ctx.font = 'bold 48px "Microsoft YaHei", sans-serif';
  ctx.fillText('中奖奖项', 112, 740);

  model.prizes.forEach((prize, index) => {
    const top = 840 + index * 180;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(112, top - 70, canvas.width - 224, 120);

    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 40px "Microsoft YaHei", sans-serif';
    ctx.fillText(prize.level, 152, top);

    ctx.fillStyle = '#f5f5f7';
    ctx.font = 'bold 56px "Microsoft YaHei", sans-serif';
    ctx.fillText(prize.name, 152, top + 64);
  });

  ctx.fillStyle = '#86868b';
  ctx.font = '36px "Microsoft YaHei", sans-serif';
  ctx.fillText('Annual Party Lottery', 112, 1750);
  ctx.fillText('祝贺获奖，分享你的高光时刻', 112, 1810);

  return canvas;
}

export function createWinnerPosterDataUrl(model) {
  const canvas = document.createElement('canvas');
  renderWinnerPoster(canvas, model);
  return canvas.toDataURL('image/png');
}

export function downloadPoster(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export async function sharePoster(dataUrl, filename, title) {
  const blob = await fetch(dataUrl).then(response => response.blob());
  const file = new File([blob], filename, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      title,
      text: title,
      files: [file],
    });
    return 'shared';
  }

  downloadPoster(dataUrl, filename);
  return 'downloaded';
}
