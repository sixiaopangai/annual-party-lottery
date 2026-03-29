/**
 * 二维码签到模块
 */

import QRCode from 'qrcode';

function buildSignUrl(baseUrl, activityId) {
  const url = new URL('sign.html', baseUrl);
  url.searchParams.set('activityId', activityId);
  return url.toString();
}

async function createQrSvgDataUrl(text, size = 250) {
  const svg = await QRCode.toString(text, {
    type: 'svg',
    width: size,
    margin: 1,
    color: {
      dark: '#0c0c0e',
      light: '#ffffffff',
    },
  });

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

class QrCodeManager {
  /**
   * 生成签到二维码（本地离线生成）
   * @param {string} activityId
   * @param {HTMLElement} containerElement
   */
  static async generateSignQRCode(activityId, containerElement) {
    if (!containerElement) return false;

    const signUrl = buildSignUrl(window.location.href, activityId);

    try {
      const qrDataUrl = await createQrSvgDataUrl(signUrl);
      containerElement.innerHTML = `
        <div class="qrcode-wrapper" style="text-align: center;">
          <img src="${qrDataUrl}" alt="签到二维码" style="padding: 10px; background: white; border-radius: 8px; width: 250px; height: 250px;">
          <p style="margin-top: 10px; font-size: var(--text-sm); color: var(--text-secondary);">扫码参与抽奖</p>
          <a href="${signUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin-top: 8px; font-size: var(--text-xs); color: var(--accent-primary); word-break: break-all;">${signUrl}</a>
        </div>
      `;
      return true;
    } catch (error) {
      console.error('[QRCode] 生成失败', error);
      containerElement.innerHTML = `
        <div class="qrcode-wrapper" style="text-align: center;">
          <p style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: 12px;">二维码生成失败，请直接打开签到链接</p>
          <a href="${signUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; font-size: var(--text-xs); color: var(--accent-primary); word-break: break-all;">${signUrl}</a>
        </div>
      `;
      return false;
    }
  }
}

export { QrCodeManager, buildSignUrl, createQrSvgDataUrl };
