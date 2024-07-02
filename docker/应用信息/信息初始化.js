function main() {
    const toolList = `FINISH(answer: str) -> str - 结束任务，返回最终结果。
TablesStructure() -> str - 获取MySQL数据库中所有表的架构详情。
RelatedTableStructure(question:str) -> str - 查询MySQL数据库中与任务关联的表结构详细信息。
ExecuteSQL(sql:str) -> object - 执行MySQL查询并返回JSON格式结果。
DisplayECharts(options:object) -> str - 根据echarts的JSON配置，展示图表。
    `
    const toolNames = "FINISH,TablesStructure,RelatedTableStructure,ExecuteSQL,DisplayECharts"

    const backgroundInfo = `
此数据库表是水泥厂的能源管理项目。
表计是工厂中的各种仪表，比如电表、水表等,记录在tb_table_meter表中。
1个表计有多个指标（tag），比如电表有电压、电流、功率等指标，记录在tb_table_meter_tag_kv表。
指标（tag）每15分钟记录一次值，记录在tb_elec_meter_history_data表。
设备是工厂中的机器或者工序，有水泥磨、风机、回转窑、破碎机、辊压机等，设备表tb_equipment，例如设备名称：一号水泥磨
设备可以有多个公式，公式表tb_equipment_formula，公式是计算设备的各个值。公式类型对应tb_library表的id，公式类型有产量，电量等等。公式名称是设备名称和公式类型的结合，比如1#水泥磨产量、1号水泥磨循环风机电量
公式按照设定的计算频率计算，将计算值存储到数据库公式历史数据表tb_formula_cal_history_data。
公式历史数据固定时间计算频率在tb_equipment_formula_reat表中，公式历史数据绑定班组计算关联班组信息在tb_work_times_record_detail表中。
在用户的问题描述中，"1#"、"1号"和"一号"是用于标识同一设备的不同术语。
例如，"1#水泥磨"、"一号水泥磨"和"1号水泥磨"都是指同一水泥磨设备，在进行查询时应采用全面覆盖的查询策略。

例如查询“昨天1#水泥磨产量是多少？”
1、在公式表中查询公式名称:SELECT * FROM tb_equipment_formula WHERE name='1#水泥磨产量' OR name='1号水泥磨产量' OR '一号水泥磨产量'
2、查公式历史数据：
    SELECT * 
    FROM tb_formula_cal_history_data AS his 
    LEFT JOIN tb_equipment_formula_reat AS re ON his.reat_id = re.id
    WHERE (his.equipment_formula_name = '1#水泥磨产量' OR equipment_formula_name='1号水泥磨产量' OR equipment_formula_name='一号水泥磨产量')
    AND re.reat_type=3
    AND DATE(his.add_time) = '2024-06-18'
      `

    return {
        toolList,
        toolNames,
        backgroundInfo
    }
}




// 在进行查询时，应采用全面覆盖的查询策略，确保所有可能的表述都被检索到，以获取完整的信息。  