import type { Route, RouteLeg } from '../cosmos/types';
import type { JobanExpressRoute, JobanZairaiExpressRoute } from './types';

export class JobanExpressProcessor {
  /**
   * 常磐線特急を含む経路を抽出
   */
  static extractJobanExpressRoutes(routes: Route[]): JobanExpressRoute[] {
    const jobanExpressRoutes: JobanExpressRoute[] = [];

    for (const route of routes) {
      // 常磐線特急を含むかチェック
      const hasJobanExpress = route.legs.some(leg =>
        leg.senkuName === '常磐線' && leg.isExpress === true && leg.from.name === '水戸' && leg.from.directFlag === "0"
      );

      if (hasJobanExpress) {
        // 常磐線特急区間のlegsを抽出
        // const jobanExpressLegs = route.legs
        //   .filter(leg => leg.senkuName === '常磐線' && leg.isExpress === true)
        //   .sort((a, b) => a.seq - b.seq); // seqの昇順でソート
        // 常磐線特急区間のlegsを抽出
        const jobanExpressLegs: RouteLeg[] = [];

        // まず、線区名が常磐線かつisExpressがtrueのlegを探す -- toのdirectFlagが0になるまでをlegsに入れる
        {
          const jobanExpressStartLeg = route.legs.find(leg =>
            leg.senkuName === '常磐線' && leg.isExpress === true && leg.from.name === '水戸' && leg.from.directFlag === "0"
          );

          if (jobanExpressStartLeg) {
            // 開始legを追加
            jobanExpressLegs.push(jobanExpressStartLeg);

            // to.directFlagが0になるまで、後続の要素を追加していく
            if (jobanExpressStartLeg.to.directFlag !== "0") {
              const startSeq = jobanExpressStartLeg.seq;

              // seq順にソートされた後続のlegsを取得
              const subsequentLegs = route.legs
                .filter(leg => leg.seq > startSeq)
                .sort((a, b) => a.seq - b.seq);

              for (const leg of subsequentLegs) {
                jobanExpressLegs.push(leg);

                // to.directFlagが0になったら終了
                if (leg.to.directFlag === "0") {
                  break;
                }
              }
            }
          }
        }

        // 経路説明文を生成
        const jobanExpressLegsRouteExplain = this.generateRouteExplain(jobanExpressLegs);

        // デバッグ用ログ
        // console.log(`[JobanExpressProcessor] Route ${route.id} - Joban Express legs:`, 
        //   jobanExpressLegs.map(leg => `${leg.from.name}→${leg.to.name}`).join(', '));
        // console.log(`[JobanExpressProcessor] Route explain: ${jobanExpressLegsRouteExplain}`);

        // JobanExpressRouteとして追加
        const jobanExpressRoute: JobanExpressRoute = {
          ...route,
          jobanExpressLegs,
          jobanExpressLegsRouteExplain
        };

        jobanExpressRoutes.push(jobanExpressRoute);
      }
    }

    // console.log(`[JobanExpressProcessor] Found ${jobanExpressRoutes.length} routes with Joban Express`);
    return jobanExpressRoutes;
  }

  /**
   * 常磐線特急を含む経路から在来線特急も含む経路を抽出
   */
  static extractJobanZairaiExpressRoutes(jobanExpressRoutes: JobanExpressRoute[]): JobanZairaiExpressRoute[] {
    const jobanZairaiExpressRoutes: JobanZairaiExpressRoute[] = [];

    for (const route of jobanExpressRoutes) {
      // 1. legsをseq昇順で並べ替える
      const sortedLegs = route.legs.sort((a, b) => a.seq - b.seq);
      
      // 2. リストの最後から調べていき、isExpress=trueで、線区名が常磐線以外のデータがあればそれを在来特急リストに入れる
      const zairaiExpressLegs: RouteLeg[] = [];
      
      for (let i = sortedLegs.length - 1; i >= 0; i--) {
        const leg = sortedLegs[i];
        if (leg.isExpress === true && leg.senkuName !== '常磐線') {
          zairaiExpressLegs.unshift(leg); // リストの先頭に挿入
          
          // 3. from.directFlagが1の場合は、その前の要素を取得しリストの先頭に挿入する
          let currentLeg = leg;
          while (currentLeg.from.directFlag === "1" && i > 0) {
            i--; // 前の要素のインデックスに移動
            const prevLeg = sortedLegs[i];
            zairaiExpressLegs.unshift(prevLeg); // リストの先頭に挿入
            currentLeg = prevLeg;
          }
        }
      }

      // 追加したリストに１つでもsenkuNameが常磐線のデータが含まれていた場合、リストをクリアし、在来特急なしにする
      const hasJobanLine = zairaiExpressLegs.some(leg => leg.senkuName === '常磐線');
      if (hasJobanLine) {
        zairaiExpressLegs.length = 0; // リストをクリア
      }

      if (zairaiExpressLegs.length > 0) {
        // senkuNameでグルーピング
        const groupedBySenku = this.groupBySenkuName(zairaiExpressLegs);

        // 各グループの経路説明文を生成
        const zairaiExpressLegsRouteExplainList: string[] = [];
        // for (const [senkuName, legs] of groupedBySenku) {
        for (const [, legs] of groupedBySenku) {
          const explainText = this.generateRouteExplain(legs);
          zairaiExpressLegsRouteExplainList.push(explainText);
          // console.log(`[JobanExpressProcessor] Zairai express (${senkuName}) legs:`, 
          //   legs.map(leg => `${leg.from.name}→${leg.to.name}`).join(', '));
          // console.log(`[JobanExpressProcessor] Zairai express route explain: ${explainText}`);
        }

        // JobanZairaiExpressRouteとして追加
        const jobanZairaiExpressRoute: JobanZairaiExpressRoute = {
          ...route,
          zairaiExpressLegsRouteExplainList
        };

        jobanZairaiExpressRoutes.push(jobanZairaiExpressRoute);
      }
    }

    // console.log(`[JobanExpressProcessor] Found ${jobanZairaiExpressRoutes.length} routes with Joban + Zairai Express`);
    return jobanZairaiExpressRoutes;
  }

  /**
   * legsから経路説明文を生成
   * 例: "常磐線: 水戸 → 上野 → 東京"
   */
  private static generateRouteExplain(legs: RouteLeg[]): string {
    if (legs.length === 0) return '';

    // 線区名を取得（すべて同じはず）
    const senkuName = legs[0].senkuName;

    // 最初のlegのfromから開始
    const stations = [legs[0].from.name];

    // 各legのtoを追加
    for (const leg of legs) {
      stations.push(leg.to.name);
    }

    return `${senkuName}: ${stations.join(' → ')}`;
  }

  /**
   * legsをsenkuNameでグルーピング（順序を保持）
   */
  private static groupBySenkuName(legs: RouteLeg[]): Map<string, RouteLeg[]> {
    const grouped = new Map<string, RouteLeg[]>();

    for (const leg of legs) {
      if (!grouped.has(leg.senkuName)) {
        grouped.set(leg.senkuName, []);
      }
      grouped.get(leg.senkuName)!.push(leg);
    }

    return grouped;
  }

}