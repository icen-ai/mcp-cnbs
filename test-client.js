// test-client.js - 简单的测试脚本用于验证API客户端功能
const { StatsApiClient } = require('./dist/api-client.js');

async function runTest() {
  console.log('=== 国家统计局数据查询测试 ===\n');

  const client = new StatsApiClient();

  // 测试1: 搜索GDP
  console.log('🔍 测试1: 搜索关键词 "GDP"');
  try {
    const searchResult = await client.search('GDP');
    console.log(`  找到 ${searchResult.result.length} 条结果\n`);

    if (searchResult.result.length > 0) {
      // 解析搜索结果
      const parsedResults = client.parseSearchResult(searchResult);
      console.log('📋 搜索结果解析:');
      parsedResults.forEach((result, index) => {
        console.log(`  [${index + 1}] ${result.name}`);
        console.log(`      最新值: ${result.value} ${result.db}`);
        console.log(`      指标码: ${result.zbCode}`);
        console.log(`      数据库: ${result.dbcode}`);
      });

      console.log('✅ 搜索功能正常工作');
    } else {
      console.log('  ❌ 未找到结果');
    }
  } catch (error) {
    console.log(`  ❌ 搜索功能错误: ${error.message}`);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // 测试2: 查询特定数据
  console.log('📈 测试2: 查询特定指标数据');
  try {
    // 尝试查询GDP数据（使用通用指标ID）
    const dataResult = await client.getData('A010101', 'hgnd', 'LAST5');
    if (dataResult.returncode === 200 && dataResult.returndata.datanodes.length > 0) {
      console.log('  ✅ 数据查询功能正常工作');
      console.log(`  返回 ${dataResult.returndata.hasdatacount} 个数据点\n`);

      // 显示一些数据点
      const validNodes = dataResult.returndata.datanodes.filter(n => n.data.hasdata);
      if (validNodes.length > 0) {
        console.log('📊 数据样例:');
        validNodes.slice(0, 3).forEach(node => {
          const zbNode = node.wds.find(w => w.wdcode === 'zb');
          const sjNode = node.wds.find(w => w.wdcode === 'sj');
          const unitInfo = dataResult.returndata.wdnodes?.find(w => w.wdcode === 'zb')
            ?.nodes?.find(n => n.code === zbNode?.valuecode)?.unit;

          console.log(`  ${sjNode?.valuecode}: ${node.data.data} ${unitInfo || ''}`);
        });
      }
    } else {
      console.log('  ❌ 数据查询未返回有效结果');
    }
  } catch (error) {
    console.log(`  ❌ 数据查询错误: ${error.message}`);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // 测试3: 获取时间维度信息
  console.log('📅 测试3: 获取时间维度信息');
  try {
    const timeDim = await client.getTimeDimensions('hgnd');
    if (timeDim.returncode === 200) {
      console.log('  ✅ 时间维度查询功能正常工作');
      const timeNode = timeDim.returndata?.find(n => n.wdcode === 'sj');
      if (timeNode && timeNode.nodes && timeNode.nodes.length > 0) {
        console.log(`  可用时间选项 (${timeNode.nodes.length}个): ${timeNode.nodes.slice(0, 3).map(n => n.code).join(', ')}`);
      }
    } else {
      console.log('  ❌ 时间维度查询未返回有效结果');
    }
  } catch (error) {
    console.log(`  ❌ 时间维度查询错误: ${error.message}`);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // 测试4: 查询叶子分类
  console.log('📋 测试4: 测试指标分类获取 (小范围)');
  try {
    console.log('   递归获取小范围分类中... （可能需要一点时间）')
    // 获取一个特定节点的直接下级分类，避免全递归太慢
    const categories = await client.getTreeSpecificNode('A01', 'hgnd');
    if (categories && categories.length > 0) {
      console.log(`  在A01节点下找到 ${categories.length} 个子分类`);
      console.log(`  示例: ${categories[0].name} -> ${categories[0].id} (${categories[0].isParent ? '父节点' : '叶子节点'})`);
      console.log('  ✅ 分类功能正常工作');
    } else {
      console.log('  ❌ 没有找到任何分类');
    }
  } catch (error) {
    console.log(`  ❌ 分类功能错误 (这是已知问题，大范围递归较慢): ${error.message}`);
  }

  console.log('\n=== 测试完成 ===');
  console.log('如需查看详细错误信息，检查网络或接口地址是否正确');
}

// 运行测试
runTest().catch(error => {
  console.error('测试出错:', error);
});