var google;
var moment;

// NOTE: add available report here
// - csv file name is based on this
// - query is based on this
const reportList = [
    'employees',
    'companies',
];

const DEFAULT_COMPANY_CODE = process.env.DEFAULT_COMPANY_CODE;

async function exportReport(req, res) {
    google = google || require('googleapis').google;

    try {
        const report = req.query.report;
        const company = req.query.company || DEFAULT_COMPANY_CODE ;
        const sqladmin =  google.sqladmin('v1beta4');

        if (!report) {
            throw new Error('Missing arguments');
        }

        if (!reportList.includes(report)) {
            throw new Error('Unsupported report type');
        }

        google.options({ 
            auth: await getAuthentication(google) 
        });

        await sqladmin.instances.export({
            instance: process.env.DB_INSTANCE,
            project: process.env.PROJECT_ID,
            requestBody: {
                "exportContext": {
                    "fileType": "CSV",
                    "uri": getBucketUriWithFilename(report, company),
                    "databases": [process.env.DB_NAME],
                    "offload": process.env.OFFLOAD || false,
                    "csvExportOptions": {
                        "selectQuery": getQuery(report, company)
                    }
                }
            }
        });

        res.status(200).json({
            status: 200,
            message: "Export request has been sent."
        });
    } catch(err) {
        console.error(err);

        res.status(500).json({
            status: 500,
            message: err.message
        });
    }
}

async function getAuthentication(client) {
    try {
        const auth = new client.auth.GoogleAuth({
            scopes: [
                'https://www.googleapis.com/auth/cloud-platform',
                'https://www.googleapis.com/auth/sqlservice.admin',
            ]
        });

        return await auth.getClient();
    } catch(err) {
        throw err;
    }
}

function getBucketUriWithFilename(filePrefix, companyCode) {
    moment = moment || require('moment');

    return `${process.env.BUCKET_URI}/`+
            `${companyCode}/`+
            `${filePrefix}_`+
            `${moment().format('YYYY-MM-DD')}.csv`;
}

function getQuery(target, company) {
    switch(target) {
        case reportList[0]: return queryEmployees(company);
        case reportList[1]: return queryCompanies(company);
        default: throw new Error('Unsupported report type');
    }
}

function queryEmployees(companyCode) {
    return `
        select 
            ea.employee_account_employee_code employee_code,
            ea.employee_account_company_code company_code,
            cd.company_details_name company,
            ea.employee_account_type account_type,
            ea.employee_account_site_assignment site_assignment,
            jt.job_title_name job_title,
            jgl.job_grade_level_name job_level,
            ea.employee_account_employment_type_code employment_type_code,
            ea.employee_account_employment_status_code employment_status_code,
            c2.city_name city,
            c.country_name country,
            epi.employee_personal_info_gender gender,
            epi.employee_personal_info_marital_status marital_status
        from employee.employee_account ea 
        left join employee.employee_address ea2 on ea.employee_account_employee_code = ea2.employee_address_employee_code 
        left join employee.employee_personal_information epi  on ea.employee_account_employee_code = epi.employee_personal_info_employee_code
        left join utilities.city c2 on ea2.employee_address_city_code = c2.city_code 
        left join utilities.country c on c2.city_country_code = c.country_code 
        left join utilities.job_title jt on ea.employee_account_job_code = jt.job_title_code 
        left join utilities.job_grade_level jgl on ea.employee_account_job_grade_level  = jgl.job_grade_level_code 
        left join company.company_details cd on cd.company_details_code = ea.employee_account_company_code 
        where ea2.employee_address_type = 'PRESENT'
        and ea.employee_account_employment_status_code != 'OFFBOARDED'
        ${(!companyCode || companyCode === DEFAULT_COMPANY_CODE) 
            ? '' : `and ea.employee_account_company_code = '${companyCode}'`
        }
        order by ea.employee_account_company_code asc;
    `;
}

function queryCompanies(companyCode) {
    return `
        select 
            cd.company_details_code company_code,
            cd.company_details_name comany_name,
            (
                select count(*) 
                from employee.employee_account ea 
                where ea.employee_account_company_code = cd.company_details_code
                and ea.employee_account_employment_status_code != 'OFFBOARDED'
            ) no_of_employees
        from company.company_details cd
        ${(!companyCode || companyCode === DEFAULT_COMPANY_CODE)
            ? '' : `where cd.company_details_code = '${companyCode}'`
        }
        order by company_details_code asc;
    `;
}

module.exports = {
    exportReport
}