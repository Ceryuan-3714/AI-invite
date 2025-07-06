/**
 * 存储工具模块 - 模拟微信小程序的存储API
 */
const Storage = {
    /**
     * 设置本地存储数据
     * @param {string} key 键名
     * @param {any} data 要存储的数据
     */
    setStorageSync: function(key, data) {
        try {
            // 将数据转换为JSON字符串
            const jsonData = JSON.stringify(data);
            localStorage.setItem(key, jsonData);
            return true;
        } catch (error) {
            console.error('存储数据失败', error);
            return false;
        }
    },

    /**
     * 获取本地存储数据
     * @param {string} key 键名
     * @returns {any} 存储的数据，如果不存在则返回null
     */
    getStorageSync: function(key) {
        try {
            const data = localStorage.getItem(key);
            if (data === null) {
                return null;
            }
            return JSON.parse(data);
        } catch (error) {
            console.error('获取存储数据失败', error);
            return null;
        }
    },

    /**
     * 删除本地存储数据
     * @param {string} key 键名
     */
    removeStorageSync: function(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('删除存储数据失败', error);
            return false;
        }
    },

    /**
     * 清空所有本地存储数据
     */
    clearStorageSync: function() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('清空存储数据失败', error);
            return false;
        }
    },

    /**
     * 初始化模拟数据
     */
    initMockData: function() {
        // 检查是否已初始化
        if (this.getStorageSync('isDataInitialized')) {
            return;
        }

        // 初始化用户数据
        const mockUsers = [
            {
                id: 'user001',
                openid: 'openid001',
                name: '张三',
                avatar: 'https://randomuser.me/api/portraits/men/1.jpg',
                company: '科技有限公司',
                position: '销售总监',
                phone: '13800138000',
                email: 'zhangsan@example.com'
            },
            {
                id: 'user002',
                openid: 'openid002',
                name: '李四',
                avatar: 'https://randomuser.me/api/portraits/women/2.jpg',
                company: '创新科技',
                position: '市场经理',
                phone: '13900139000',
                email: 'lisi@example.com'
            }
        ];
        this.setStorageSync('users', mockUsers);

        // 初始化时间选择数据
        const mockTimeSelections = {
            'ts001': {
                id: 'ts001',
                creatorId: 'user001',
                title: '产品演示会议',
                date: '2023-10-15',
                location: '线上会议',
                availableDates: [
                    '2023-10-15',
                    '2023-10-16',
                    '2023-10-17'
                ],
                timeOptions: [
                    {
                        time: '09:00-10:00',
                        label: '上午9点-10点',
                        confirmed: [],
                        isCustom: false
                    },
                    {
                        time: '10:30-11:30',
                        label: '上午10:30-11:30',
                        confirmed: [],
                        isCustom: false
                    },
                    {
                        time: '14:00-15:00',
                        label: '下午2点-3点',
                        confirmed: [],
                        isCustom: false
                    }
                ],
                createdAt: new Date().toISOString()
            },
            'ts002': {
                id: 'ts002',
                creatorId: 'user002',
                title: '项目合作讨论',
                date: '2023-10-18',
                location: '公司会议室',
                availableDates: [
                    '2023-10-18',
                    '2023-10-19',
                    '2023-10-20'
                ],
                timeOptions: [
                    {
                        time: '13:00-14:00',
                        label: '下午1点-2点',
                        confirmed: [],
                        isCustom: false
                    },
                    {
                        time: '15:00-16:00',
                        label: '下午3点-4点',
                        confirmed: [],
                        isCustom: false
                    },
                    {
                        time: '16:30-17:30',
                        label: '下午4:30-5:30',
                        confirmed: [],
                        isCustom: false
                    }
                ],
                createdAt: new Date().toISOString()
            }
        };
        this.setStorageSync('pendingTimeSelections', mockTimeSelections);

        // 初始化通知
        const mockNotifications = [
            {
                id: 'n001',
                type: 'timeConfirmation',
                creatorId: 'user001',
                title: '单约时间已确认',
                content: '您的单约(2023-10-15)有新的时间确认',
                selectionId: 'ts001',
                selectedDate: '2023-10-15',
                selectedTimes: ['09:00-10:00'],
                confirmedBy: mockUsers[1],
                otherConfirmed: [],
                location: '线上会议',
                read: false,
                createdAt: new Date().toISOString()
            }
        ];
        this.setStorageSync('notifications', mockNotifications);
        this.setStorageSync('unreadNotifications', 1);

        // 设置默认登录用户
        this.setStorageSync('isLoggedIn', false);
        this.setStorageSync('userInfo', null);

        // 标记数据已初始化
        this.setStorageSync('isDataInitialized', true);
    }
};

// 页面加载时初始化模拟数据
document.addEventListener('DOMContentLoaded', function() {
    Storage.initMockData();
});