package com.zydwz.pojo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * @author 章鱼大丸子
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class Student {
    private String id;
    private String name;
    private int age;
    private Teacher teacher;
}
